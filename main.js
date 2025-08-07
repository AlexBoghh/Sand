import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';

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

  // Wooden or metal stand
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.7, metalness: 0.1 });
  const ringGeo = new THREE.TorusGeometry(BULB_RADIUS + GLASS_THICKNESS * 1.2, 0.03, 12, 64);
  const ringTop = new THREE.Mesh(ringGeo, ringMat);
  ringTop.position.y = HALF_HEIGHT + 0.02;
  scene.add(ringTop);
  const ringBottom = ringTop.clone();
  ringBottom.position.y = -HALF_HEIGHT - 0.02;
  scene.add(ringBottom);
})();

// Particle-based sand
const NUM_PARTICLES = 14000; // Adjust for performance
const GRAVITY = 5.5;         // Gravity acceleration
const TIME_STEP = 1 / 60;    // Fixed timestep
const LINEAR_DAMPING = 0.995;
const WALL_RESTITUTION = 0.4;
const FLOOR_BOUNCE = 0.25;
const VISCOSITY = 0.0025;    // Mild velocity damping to calm jitter
const SETTLE_SPEED = 0.08;   // Max speed to allow settling
const SETTLE_Y_EPS = 0.012;  // How close to the bottom to settle

const FUNNEL_EXTRA_G = 22.0;     // Extra downward accel inside neck region
const FUNNEL_CENTERING = 8.0;    // Pull towards centerline in neck

// Geometry and material for points
const sandGeometry = new THREE.BufferGeometry();
const positions = new Float32Array(NUM_PARTICLES * 3);
const velocities = new Float32Array(NUM_PARTICLES * 3);
const settled = new Uint8Array(NUM_PARTICLES); // 0=free, 1=settled bottom

// Helper to sample a random point inside the top bulb volume
function samplePointInTopBulb() {
  // Rejection sampling using cylindrical coordinates limited by innerRadiusAtY(y)
  for (let attempts = 0; attempts < 50; attempts++) {
    const y = THREE.MathUtils.lerp(0.12, HALF_HEIGHT - 0.04, Math.random());
    const rMax = innerRadiusAtY(y) * 0.98;
    const rr = Math.sqrt(Math.random()) * rMax; // Prefer center slightly
    const ang = Math.random() * Math.PI * 2;
    const x = rr * Math.cos(ang);
    const z = rr * Math.sin(ang);
    return new THREE.Vector3(x, y, z);
  }
  return new THREE.Vector3(0, HALF_HEIGHT * 0.6, 0);
}

// Initialize particles in the top chamber
for (let i = 0; i < NUM_PARTICLES; i++) {
  const p = samplePointInTopBulb();
  positions[3 * i + 0] = p.x;
  positions[3 * i + 1] = p.y;
  positions[3 * i + 2] = p.z;

  // Initial small random jiggle helps separate particles
  velocities[3 * i + 0] = (Math.random() - 0.5) * 0.02;
  velocities[3 * i + 1] = (Math.random() - 0.5) * 0.02;
  velocities[3 * i + 2] = (Math.random() - 0.5) * 0.02;
}

sandGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

const sandMaterial = new THREE.PointsMaterial({
  color: 0xf3d7a5,
  size: 0.02,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0.95,
  depthWrite: false,
});

const sandPoints = new THREE.Points(sandGeometry, sandMaterial);
scene.add(sandPoints);

// Optional: a simple conical sand pile visual aid that grows with settled particles
const coneMaxHeight = 0.9;
const coneGeo = new THREE.ConeGeometry(0.001, 0.001, 48, 1, true);
const coneMat = new THREE.MeshStandardMaterial({ color: 0xd9c08d, roughness: 0.8, metalness: 0.0, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
const sandPile = new THREE.Mesh(coneGeo, coneMat);
 sandPile.position.y = -HALF_HEIGHT;
 sandPile.rotation.x = 0;
 scene.add(sandPile);

function updateConePile(showFraction) {
  const radius = BULB_RADIUS * 0.92 * Math.pow(showFraction, 0.42);
  const height = coneMaxHeight * Math.pow(showFraction, 0.62);
  sandPile.geometry.dispose();
  sandPile.geometry = new THREE.ConeGeometry(Math.max(0.001, radius), Math.max(0.001, height), 64, 1, true);
  sandPile.position.y = -HALF_HEIGHT + height * 0.5;
}

// Physics integration and constraints
function stepPhysics(dt) {
  const neckYMin = -NECK_HALF_HEIGHT;
  const neckYMax = +NECK_HALF_HEIGHT;

  let settledCount = 0;

  for (let i = 0; i < NUM_PARTICLES; i++) {
    if (settled[i] === 1) { settledCount++; continue; }

    const ix = 3 * i;
    let px = positions[ix + 0];
    let py = positions[ix + 1];
    let pz = positions[ix + 2];

    let vx = velocities[ix + 0];
    let vy = velocities[ix + 1];
    let vz = velocities[ix + 2];

    // Gravity and damping
    vy -= GRAVITY * dt;

    vx *= LINEAR_DAMPING;
    vy *= LINEAR_DAMPING;
    vz *= LINEAR_DAMPING;

    // Mild viscosity
    vx -= vx * VISCOSITY;
    vy -= vy * VISCOSITY * 0.5;
    vz -= vz * VISCOSITY;

    // Neck funnel extra acceleration and centering
    if (py > neckYMin && py < neckYMax) {
      const rAtY = innerRadiusAtY(py);
      const rLen = Math.hypot(px, pz);
      if (rLen < rAtY * 0.9) {
        vy -= FUNNEL_EXTRA_G * dt;
        // Pull to center, scaled with radius
        vx += (-px) * FUNNEL_CENTERING * dt / (rAtY + 1e-3);
        vz += (-pz) * FUNNEL_CENTERING * dt / (rAtY + 1e-3);
      }
    }

    // Integrate
    px += vx * dt;
    py += vy * dt;
    pz += vz * dt;

    // Collide with inner boundary (hourglass wall)
    const rY = innerRadiusAtY(py) - 0.006; // small margin inside glass
    const radialLen = Math.hypot(px, pz);
    if (radialLen > rY) {
      // Project back to boundary and reflect velocity
      const nx = px / (radialLen + 1e-6);
      const nz = pz / (radialLen + 1e-6);
      const over = radialLen - rY;
      px -= nx * over;
      pz -= nz * over;
      // Split velocity into normal/tangent
      const vDotN = vx * nx + vz * nz;
      vx -= (1 + WALL_RESTITUTION) * vDotN * nx;
      vz -= (1 + WALL_RESTITUTION) * vDotN * nz;
      // add some friction
      vx *= 0.96;
      vz *= 0.96;
    }

    // Cap collisions top and bottom
    if (py > HALF_HEIGHT) {
      py = HALF_HEIGHT;
      vy = -vy * FLOOR_BOUNCE;
      vx *= 0.96; vz *= 0.96;
    }

    if (py < -HALF_HEIGHT) {
      py = -HALF_HEIGHT;
      vy = -vy * FLOOR_BOUNCE;
      vx *= 0.95; vz *= 0.95;
    }

    // Settle conditions at bottom
    if (py <= -HALF_HEIGHT + SETTLE_Y_EPS && Math.abs(vy) < SETTLE_SPEED) {
      const rBottom = innerRadiusAtY(-HALF_HEIGHT + 1e-3) - 0.01;
      const rLen2 = Math.hypot(px, pz);
      if (rLen2 < rBottom) {
        py = -HALF_HEIGHT + 0.001 + (Math.random() * 0.003);
        vx = 0; vy = 0; vz = 0;
        settled[i] = 1;
        settledCount++;
      }
    }

    // Write back
    positions[ix + 0] = px;
    positions[ix + 1] = py;
    positions[ix + 2] = pz;

    velocities[ix + 0] = vx;
    velocities[ix + 1] = vy;
    velocities[ix + 2] = vz;
  }

  // Update sand pile visualization
  const frac = settledCount / NUM_PARTICLES;
  updateConePile(frac);
}

// Flip function: invert the hourglass and reset settled particles
function flipHourglass() {
  for (let i = 0; i < NUM_PARTICLES; i++) {
    const ix = 3 * i;
    positions[ix + 1] = -positions[ix + 1];
    velocities[ix + 0] = 0.0;
    velocities[ix + 1] = 0.0;
    velocities[ix + 2] = 0.0;
    settled[i] = 0;
  }
}

window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'f') {
    flipHourglass();
  }
});

// Animate
let accumulator = 0;
let lastTime = performance.now() / 1000;

function animate() {
  const now = performance.now() / 1000;
  let dt = now - lastTime;
  lastTime = now;
  dt = Math.min(dt, 0.05);

  accumulator += dt;
  const fixedDt = TIME_STEP;
  while (accumulator >= fixedDt) {
    stepPhysics(fixedDt);
    accumulator -= fixedDt;
  }

  sandGeometry.attributes.position.needsUpdate = true;

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