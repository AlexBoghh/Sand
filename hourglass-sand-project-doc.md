# Hourglass Sand Simulation - Technical Specification
## League Detox Platform - 21-Day Commitment Visualization

---

## 🎯 Project Overview

### What We're Building
An interactive 3D hourglass with realistic sand flow that visualizes a user's 21-day journey to quit League of Legends. The sand serves as a metaphor for time passing and commitment progress, transitioning from toxic purple (addiction) to golden (freedom) over the course of 21 days.

### Core Purpose
- **Primary Goal**: Create a visually compelling representation of time passing during the 21-day detox period
- **Emotional Impact**: Users should feel the weight of their commitment and see tangible progress
- **Technical Goal**: Achieve photorealistic sand simulation at 60fps across all devices

---

## 🏗️ Technical Architecture

### The Hybrid Approach
We're implementing a **shader-based volumetric system with minimal particle effects** to achieve maximum visual quality with optimal performance.

```
┌─────────────────────────────────────┐
│      UPPER CHAMBER (Shader Mesh)     │
│   - Volumetric sand that decreases   │
│   - Procedural surface deformation   │
│   - No actual particles              │
└───────────────┬─────────────────────┘
                │
         ╔══════▼══════╗
         ║  NECK FLOW   ║
         ║ (500-1000    ║
         ║  particles)  ║
         ╚══════▬══════╝
                │
┌───────────────▼─────────────────────┐
│      LOWER CHAMBER (Shader Mesh)     │
│   - Growing sand pile                │
│   - Procedural cone formation        │
│   - Height accumulation over time    │
└─────────────────────────────────────┘
```

### Why This Approach?

| Component | Traditional (All Particles) | Our Approach (Hybrid) | Benefit |
|-----------|-----------------------------|-----------------------|---------|
| Upper Chamber | 50,000 particles | 1 deforming mesh | 99% fewer draw calls |
| Sand Flow | Hidden in mass | 500-1000 particles | Only visible particles |
| Lower Chamber | 50,000 particles | 1 growing mesh | Realistic pile formation |
| **Total** | **100,000+ particles** | **~1,000 particles + 2 meshes** | **60fps on mobile** |

---

## 🎨 Visual Requirements

### Sand Appearance Evolution

#### Day 1-7: "The Void Phase"
- **Color**: Deep purple (#9146FF) representing void corruption
- **Behavior**: Reluctant, sticky flow
- **Particles**: Dark with purple glow
- **Metaphor**: Addiction's grip

#### Day 8-14: "The Transition"
- **Color**: Purple fading to sandy brown
- **Behavior**: Normalizing flow rate
- **Particles**: Mixed colors, some sparkle
- **Metaphor**: Breaking free

#### Day 15-21: "Liberation"
- **Color**: Golden sand (#FFD700)
- **Behavior**: Smooth, natural flow
- **Particles**: Golden with shimmer
- **Metaphor**: Freedom and success

### Technical Visual Features

```javascript
// Required visual effects
const visualFeatures = {
  // Surface details
  sandGrainTexture: "Procedural noise-based",
  surfaceDeformation: "Cone depression at pour point",
  angleOfRepose: "30-35 degrees for realistic piles",
  
  // Lighting effects
  subsurfaceScattering: "Fake SSS for sand translucency",
  rimLighting: "Fresnel effect for depth",
  sparkleEffect: "Specular highlights on individual grains",
  
  // Dynamic elements
  flowVisualization: "Spiral motion in particle stream",
  dustParticles: "Ambient floating dust (optional)",
  impactRipples: "Where stream hits pile"
};
```

---

## 📊 Performance Targets

### Minimum Requirements

| Platform | Target FPS | Particle Count | Quality Settings |
|----------|------------|----------------|------------------|
| Desktop (High) | 60 fps | 1000 stream + effects | Full shaders, shadows |
| Desktop (Medium) | 60 fps | 500 stream | Simplified shaders |
| Mobile (iPhone 12+) | 30-60 fps | 300 stream | Basic shaders |
| Mobile (Older) | 30 fps | 100 stream | Minimal effects |

### Optimization Strategies

1. **LOD System**
   ```javascript
   if (distance > 10m) → Show static hourglass only
   if (distance > 5m)  → Reduce particle count by 50%
   if (distance < 5m)  → Full quality
   ```

2. **Adaptive Quality**
   - Monitor FPS and auto-adjust particle count
   - Disable shadows on mobile
   - Simplify shaders based on GPU tier

3. **Culling**
   - Don't update particles outside viewport
   - Pause simulation when tab is inactive

---

## 🔧 Implementation Phases

### Phase 1: Foundation (Week 1)
- [x] Research sand physics and Beverloo equation
- [ ] Set up Three.js scene with hourglass model
- [ ] Implement basic shader for sand volumes
- [ ] Create upper chamber with decreasing fill level

### Phase 2: Core Mechanics (Week 2)
- [ ] Implement particle stream (500-1000 particles)
- [ ] Add gravity and collision physics
- [ ] Create lower chamber pile accumulation
- [ ] Implement 21-day timing system

### Phase 3: Visual Polish (Week 3)
- [ ] Add procedural normal mapping for sand texture
- [ ] Implement color transition (purple → gold)
- [ ] Add lighting and shadow system
- [ ] Create surface deformation effects

### Phase 4: Optimization (Week 4)
- [ ] Implement LOD system
- [ ] Add mobile detection and adaptation
- [ ] Performance profiling and optimization
- [ ] Cross-browser testing

### Phase 5: Integration (Week 5)
- [ ] Connect to user progress data
- [ ] Add pause/resume functionality
- [ ] Implement day transition animations
- [ ] Create failure/success states

---

## 🏛️ Technical Stack

### Core Dependencies
```json
{
  "three": "^0.161.0",
  "@react-three/fiber": "^8.15.0",
  "@react-three/drei": "^9.96.0",
  "dependencies": {
    "Required": [
      "three.js - 3D rendering",
      "WebGL 2.0 - GPU acceleration"
    ],
    "Optional": [
      "@react-three/postprocessing - Visual effects",
      "leva - Debug GUI for testing"
    ]
  }
}
```

### File Structure
```
src/
├── components/
│   └── 3d/
│       ├── HourglassModel.jsx         // Loads GLB model
│       ├── SandVolumes.jsx            // Upper/lower chambers
│       ├── ParticleStream.jsx         // Falling particles
│       └── HourglassController.jsx    // Main orchestrator
├── shaders/
│   ├── sandVolume.vert.glsl          // Vertex shader
│   ├── sandVolume.frag.glsl          // Fragment shader
│   └── particleStream.glsl           // Stream shaders
├── utils/
│   ├── physics.js                    // Beverloo equation
│   ├── deviceDetection.js            // Performance tier
│   └── timeManagement.js             // 21-day calculations
└── hooks/
    └── useHourglassSimulation.js     // React integration
```

---

## 💡 Key Technical Decisions

### Why Hybrid Instead of Full Particles?

**Option 1: 100,000 Particles (Rejected)**
- ❌ 15-30 fps on mobile
- ❌ High battery drain
- ❌ Memory intensive (400MB+)

**Option 2: Pure Shader (Rejected)**
- ❌ No visible flow movement
- ❌ Lacks dynamic feel
- ❌ Users don't perceive progress

**Option 3: Hybrid Approach (Selected) ✅**
- ✅ 60fps on all devices
- ✅ Visible flow with minimal particles
- ✅ Low memory footprint (< 50MB)
- ✅ Battery efficient

### Why Procedural Over Texture Maps?

**Procedural Normal Maps:**
- ✅ No loading time
- ✅ Infinite resolution
- ✅ Can animate (flowing dunes)
- ✅ 0KB additional downloads

**Traditional Textures:**
- ❌ 2-5MB per texture
- ❌ Loading delays
- ❌ Fixed resolution
- ❌ Static appearance

---

## 📐 Physics Implementation

### The Beverloo Equation
Controls realistic flow rate through the hourglass neck:

```javascript
// Beverloo equation for granular flow
const flowRate = C * Math.sqrt(g) * Math.pow(D - k*d, 2.5);

where:
  C = 0.6  // Discharge coefficient
  g = 9.81 // Gravity
  D = neck diameter
  k = 2.9  // Shape factor
  d = particle diameter
```

### Sand Pile Formation
Implementing angle of repose for realistic accumulation:

```javascript
const angleOfRepose = 30; // degrees for dry sand
const maxSlope = Math.tan(angleOfRepose * Math.PI / 180);

// Height at any point from center
height = maxHeight - distanceFromCenter * maxSlope;
```

---

## 🎮 User Interaction Points

### Interactive Features
1. **Rotation**: Drag to rotate hourglass view
2. **Zoom**: Scroll to zoom in/out
3. **Day Preview**: Slider to preview any day
4. **Speed Control**: Debug mode for testing
5. **Quality Toggle**: Manual quality adjustment

### State Transitions
```
INITIAL → Load model and textures
  ↓
READY → Show full hourglass (purple sand)
  ↓
RUNNING → Sand flowing (21-day timer active)
  ↓
SUCCESS → Golden explosion effect
  or
FAILURE → Sand reverses flow (time rewind)
```

---

## 📈 Success Metrics

### Performance KPIs
- **Load Time**: < 3 seconds on 4G
- **Frame Rate**: Consistent 60fps desktop, 30fps mobile
- **Memory Usage**: < 100MB total
- **Battery Impact**: < 5% drain per hour

### Visual Quality Checklist
- [ ] Sand looks granular, not liquid
- [ ] Flow rate appears constant
- [ ] Color transition is smooth
- [ ] Pile forms naturally
- [ ] No visible popping/glitches
- [ ] Shadows enhance depth
- [ ] Works in light/dark themes

---

## 🚀 Deployment Considerations

### CDN Strategy
```javascript
// Asset loading priority
1. Hourglass model (critical)
2. Shader code (critical)
3. Particle textures (enhancement)
4. Sound effects (optional)
```

### Browser Support
- **Required**: WebGL 2.0 (96% global support)
- **Fallback**: Static image for unsupported browsers
- **Enhanced**: WebGPU when available (future)

---

## 📚 References & Resources

### Technical Papers
- "Beverloo's Law and the Flow of Granular Materials" - Physics Review
- "Real-time Sand Rendering in Journey" - GDC Talk
- "GPU-Accelerated Particle Systems" - SIGGRAPH

### Three.js Resources
- [Three.js Journey - Particles](https://threejs-journey.com/lessons/particles)
- [GPGPU Flow Fields](https://threejs-journey.com/lessons/gpgpu-flow-field-particles-shaders)
- [Shader Development](https://thebookofshaders.com/)

### Inspiration
- Journey (PS3) - Sand rendering
- Assassin's Creed Origins - Desert simulation
- Alto's Odyssey - Stylized sand physics

---

## ✅ Definition of Done

The hourglass sand simulation is complete when:

1. **Performance**: Maintains target FPS on all supported devices
2. **Visual**: Sand appears realistic and matches design specs
3. **Timing**: 21-day progression is accurate and smooth
4. **Integration**: Connects properly with user progress data
5. **Polish**: No visual glitches or physics errors
6. **Accessibility**: Includes reduced motion option
7. **Testing**: Passes all browser and device tests

---

## 🤝 Team Collaboration

### For Developers
- Follow the hybrid approach architecture
- Prioritize performance over visual features
- Test on real devices, not just desktop

### For Designers
- Sand colors are transitional (purple → gold)
- Flow rate is constant (Beverloo equation)
- Pile shape follows physics (30° angle)

### For Product
- 21-day timing is non-negotiable
- Mobile performance is critical
- Visual impact drives user engagement

---

*This document is a living specification and will be updated as development progresses.*