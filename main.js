import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { GPUComputationRenderer } from 'https://unpkg.com/three@0.160.0/examples/jsm/misc/GPUComputationRenderer.js';

// Scene setup
const root = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
root.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0d16, 12, 30);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0.8, 5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxDistance = 12;
controls.minDistance = 2.2;

// Lights
{
  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x2a1b0a, 0.9);
  hemi.position.set(0, 4, 0);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(3, 5, 4);
  dir.castShadow = false;
  scene.add(dir);

  const rim = new THREE.DirectionalLight(0x88b7ff, 0.3);
  rim.position.set(-4, 2, -5);
  scene.add(rim);
}

// Floor
{
  const geo = new THREE.CircleGeometry(8, 64);
  const mat = new THREE.MeshStandardMaterial({ color: 0x0f1322, roughness: 0.9, metalness: 0.0 });
  const floor = new THREE.Mesh(geo, mat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.0;
  floor.receiveShadow = false;
  scene.add(floor);
}

// Hourglass parameters and shaping
const HALF_HEIGHT = 1.6;           // Half height of inner cavity
const BULB_RADIUS = 0.95;          // Radius at the top/bottom bulges (inner cavity)
const NECK_RADIUS = 0.08;          // Radius at narrow neck (inner cavity)
const GLASS_THICKNESS = 0.035;     // Visual glass thickness for the lathe shell
const SHAPE_POWER = 1.6;           // Controls curvature between neck and bulbs
const NECK_HALF_HEIGHT = 0.14;     // Region where extra funnel forces apply

function innerRadiusAtY(y) {
  const t = Math.min(1.0, Math.max(0.0, Math.abs(y) / HALF_HEIGHT));
  const curve = Math.pow(t, SHAPE_POWER); // 0 at neck, 1 at caps
  return NECK_RADIUS + (BULB_RADIUS - NECK_RADIUS) * curve;
}

// Create glass shell using a lathe of the OUTER profile
(function createGlass() {
  const segments = 200;
  const profile = [];
  for (let i = 0; i <= segments; i++) {
    const v = i / segments; // 0..1 from bottom(-H) to top(+H)
    const y = -HALF_HEIGHT + 2 * HALF_HEIGHT * v;
    const r = innerRadiusAtY(y) + GLASS_THICKNESS;
    profile.push(new THREE.Vector2(r, y));
  }
  const latheGeo = new THREE.LatheGeometry(profile, 256);
  latheGeo.computeVertexNormals();
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0.05,
    transmission: 0.95,
    thickness: 0.25,
    ior: 1.45,
    transparent: true,
    opacity: 0.6,
    envMapIntensity: 1.0,
  });
  const glass = new THREE.Mesh(latheGeo, glassMat);
  scene.add(glass);

  // Stand rings
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.7, metalness: 0.1 });
  const ringGeo = new THREE.TorusGeometry(BULB_RADIUS + GLASS_THICKNESS * 1.2, 0.03, 12, 64);
  const ringTop = new THREE.Mesh(ringGeo, ringMat);
  ringTop.position.y = HALF_HEIGHT + 0.02;
  scene.add(ringTop);
  const ringBottom = ringTop.clone();
  ringBottom.position.y = -HALF_HEIGHT - 0.02;
  scene.add(ringBottom);
})();

// ------------------------------
// GPGPU Particle Simulation
// ------------------------------

// Change these to scale particle count (width * height)
const TEXTURE_WIDTH = 256;
const TEXTURE_HEIGHT = 256;
const NUM_PARTICLES = TEXTURE_WIDTH * TEXTURE_HEIGHT;

// Physics constants
const GRAVITY = 6.0;
const LINEAR_DAMPING = 0.995;
const VISCOSITY = 0.0025;
const WALL_RESTITUTION = 0.4;
const FLOOR_BOUNCE = 0.25;
const FUNNEL_EXTRA_G = 22.0;
const FUNNEL_CENTERING = 8.0;

// GPUComputation setup
const gpu = new GPUComputationRenderer(TEXTURE_WIDTH, TEXTURE_HEIGHT, renderer);

// Helper: create initial textures
const dtPosition = gpu.createTexture();
const dtVelocity = gpu.createTexture();

function randNormal() {
  // Box-Muller for slight spread
  const u = Math.random();
  const v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u + 1e-6)) * Math.cos(2.0 * Math.PI * v);
}

function samplePointInTopBulb() {
  for (let attempts = 0; attempts < 64; attempts++) {
    const y = THREE.MathUtils.lerp(0.12, HALF_HEIGHT - 0.05, Math.random());
    const rMax = innerRadiusAtY(y) * 0.98;
    const rr = Math.sqrt(Math.random()) * rMax;
    const ang = Math.random() * Math.PI * 2;
    const x = rr * Math.cos(ang);
    const z = rr * Math.sin(ang);
    return new THREE.Vector3(x, y, z);
  }
  return new THREE.Vector3(0, HALF_HEIGHT * 0.6, 0);
}

// Fill initial textures
{
  const posArray = dtPosition.image.data; // Float32Array RGBA
  const velArray = dtVelocity.image.data;
  let ptr = 0;
  for (let j = 0; j < TEXTURE_HEIGHT; j++) {
    for (let i = 0; i < TEXTURE_WIDTH; i++) {
      const p = samplePointInTopBulb();
      posArray[ptr + 0] = p.x;
      posArray[ptr + 1] = p.y;
      posArray[ptr + 2] = p.z;
      posArray[ptr + 3] = 1.0;

      // tiny jitter
      velArray[ptr + 0] = randNormal() * 0.02;
      velArray[ptr + 1] = randNormal() * 0.02;
      velArray[ptr + 2] = randNormal() * 0.02;
      velArray[ptr + 3] = 0.0;

      ptr += 4;
    }
  }
}

// Shaders
const commonDefs = /* glsl */`
  float innerRadiusAtY(float y) {
    float t = clamp(abs(y) / ${HALF_HEIGHT.toFixed(6)}, 0.0, 1.0);
    float curve = pow(t, ${SHAPE_POWER.toFixed(6)});
    return ${NECK_RADIUS.toFixed(6)} + (${BULB_RADIUS.toFixed(6)} - ${NECK_RADIUS.toFixed(6)}) * curve;
  }
`;

const velocityFragmentShader = /* glsl */`
  uniform sampler2D texturePosition;
  uniform sampler2D textureVelocity;
  uniform float uDelta;
  uniform float uGravitySign;

  ${commonDefs}

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D(texturePosition, uv).xyz;
    vec3 vel = texture2D(textureVelocity, uv).xyz;

    // Gravity
    vel.y += -${GRAVITY.toFixed(6)} * uGravitySign * uDelta;

    // Linear damping and mild viscosity
    vel *= ${LINEAR_DAMPING.toFixed(6)};
    vel -= vel * ${VISCOSITY.toFixed(6)};

    // Funnel acceleration and centering in neck region
    if (pos.y > -${NECK_HALF_HEIGHT.toFixed(6)} && pos.y < ${NECK_HALF_HEIGHT.toFixed(6)}) {
      float rAtY = innerRadiusAtY(pos.y);
      float rLen = length(pos.xz);
      if (rLen < rAtY * 0.9) {
        vel.y += -${FUNNEL_EXTRA_G.toFixed(6)} * uGravitySign * uDelta;
        if (rLen > 1e-6) {
          vec2 n = -pos.xz / rAtY; // towards center
          vel.xz += n * ${FUNNEL_CENTERING.toFixed(6)} * uDelta;
        }
      }
    }

    // Collide with inner boundary (approx using current pos)
    float rY = innerRadiusAtY(pos.y) - 0.006;
    float radialLen = length(pos.xz);
    if (radialLen > rY && radialLen > 1e-6) {
      vec2 nxz = pos.xz / radialLen;
      float vDotN = dot(vel.xz, nxz);
      if (vDotN > 0.0) {
        vel.xz -= (1.0 + ${WALL_RESTITUTION.toFixed(6)}) * vDotN * nxz;
        vel.xz *= 0.96;
      }
    }

    // Cap collisions
    if (pos.y > ${HALF_HEIGHT.toFixed(6)} && vel.y > 0.0) {
      vel.y = -vel.y * ${FLOOR_BOUNCE.toFixed(6)};
      vel.xz *= 0.96;
    }
    if (pos.y < -${HALF_HEIGHT.toFixed(6)} && vel.y < 0.0) {
      vel.y = -vel.y * ${FLOOR_BOUNCE.toFixed(6)};
      vel.xz *= 0.95;
    }

    gl_FragColor = vec4(vel, 1.0);
  }
`;

const positionFragmentShader = /* glsl */`
  uniform sampler2D texturePosition;
  uniform sampler2D textureVelocity;
  uniform float uDelta;

  ${commonDefs}

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D(texturePosition, uv).xyz;
    vec3 vel = texture2D(textureVelocity, uv).xyz;

    // Integrate
    pos += vel * uDelta;

    // Project back inside boundary in case of drift
    float rY = innerRadiusAtY(pos.y) - 0.006;
    float radialLen = length(pos.xz);
    if (radialLen > rY && radialLen > 1e-6) {
      vec2 nxz = pos.xz / radialLen;
      float over = radialLen - rY;
      pos.xz -= nxz * over;
    }

    // Clamp top/bottom
    pos.y = clamp(pos.y, -${HALF_HEIGHT.toFixed(6)}, ${HALF_HEIGHT.toFixed(6)});

    gl_FragColor = vec4(pos, 1.0);
  }
`;

// Create variables
const velVar = gpu.addVariable('textureVelocity', velocityFragmentShader, dtVelocity);
const posVar = gpu.addVariable('texturePosition', positionFragmentShader, dtPosition);

gpu.setVariableDependencies(velVar, [posVar, velVar]);
gpu.setVariableDependencies(posVar, [posVar, velVar]);

velVar.material.uniforms.uDelta = { value: 0.0 };
velVar.material.uniforms.uGravitySign = { value: 1.0 };

posVar.material.uniforms.uDelta = { value: 0.0 };

const initError = gpu.init();
if (initError) {
  console.error(initError);
}

// Renderable particles using shader material
const particleGeometry = new THREE.BufferGeometry();
const aRef = new Float32Array(NUM_PARTICLES * 2);
let ptr = 0;
for (let y = 0; y < TEXTURE_HEIGHT; y++) {
  for (let x = 0; x < TEXTURE_WIDTH; x++) {
    aRef[ptr++] = (x + 0.5) / TEXTURE_WIDTH;
    aRef[ptr++] = (y + 0.5) / TEXTURE_HEIGHT;
  }
}
particleGeometry.setAttribute('aRef', new THREE.BufferAttribute(aRef, 2));

// A dummy position so Three.js knows it's points; values unused in shader
const dummyPositions = new Float32Array(NUM_PARTICLES * 3);
particleGeometry.setAttribute('position', new THREE.BufferAttribute(dummyPositions, 3));

const particleVertexShader = /* glsl */`
  uniform sampler2D tPosition;
  uniform float uPointSize;
  uniform float uHalfHeight;
  attribute vec2 aRef;
  varying float vFade;
  void main() {
    vec3 pos = texture2D(tPosition, aRef).xyz;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = uPointSize * (300.0 / -mvPosition.z);
    vFade = clamp(1.0 - abs(pos.y) / uHalfHeight, 0.2, 1.0);
  }
`;

const particleFragmentShader = /* glsl */`
  precision mediump float;
  uniform vec3 uColor;
  varying float vFade;
  void main() {
    vec2 r = gl_PointCoord - 0.5;
    float d = length(r);
    float alpha = smoothstep(0.5, 0.45, d) * vFade;
    vec3 col = uColor;
    gl_FragColor = vec4(col, alpha);
  }
`;

const particleMaterial = new THREE.ShaderMaterial({
  uniforms: {
    tPosition: { value: null },
    uPointSize: { value: 2.2 },
    uHalfHeight: { value: HALF_HEIGHT },
    uColor: { value: new THREE.Color(0xf3d7a5) },
  },
  vertexShader: particleVertexShader,
  fragmentShader: particleFragmentShader,
  transparent: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
});

const particlePoints = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particlePoints);

// Flip function: invert gravity sign and add slight jitter to unstick
let gravitySign = 1.0;
function flipHourglass() {
  gravitySign *= -1.0;
  velVar.material.uniforms.uGravitySign.value = gravitySign;
}

window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'f') {
    flipHourglass();
  }
});

// Animate
let lastTime = performance.now() / 1000;
function animate() {
  const now = performance.now() / 1000;
  let dt = now - lastTime;
  lastTime = now;
  dt = Math.min(dt, 0.033);

  velVar.material.uniforms.uDelta.value = dt;
  posVar.material.uniforms.uDelta.value = dt;

  gpu.compute();

  particleMaterial.uniforms.tPosition.value = gpu.getCurrentRenderTarget(posVar).texture;

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

// Handle resizing
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);