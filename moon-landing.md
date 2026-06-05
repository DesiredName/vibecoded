# Moon Landing — Design Document

Files (to create): `src/games/moon-landing/game.ts`, `src/games/moon-landing/MoonLandingGame.vue`

---

## Implementation Phases

### Phase 1 — Core Physics & Scene (`game.ts` skeleton)
- Three.js scene: orthographic side-view camera, ambient + accent light, star field
- Ship mesh (simple triangle outline, like asteroids)
- Thruster flame mesh (toggled by thrust > 0)
- Gravity, thrust, tilt physics loop (vel, angularVel, angle, pos each frame)
- Fuel drain + hard cutoff at 0
- Procedural terrain generation: Catmull-Rom spline, heightmap, 1 primary flat pad
- Terrain mesh (filled polygon + edge highlight)
- Landing pad mesh (flat colored bar)
- Landing detection: check ship vs heightmap and pad bounds each frame
- Crash detection: ship touches terrain outside pad → crash
- Phase state machine: `countdown → flying → landed | crashed`
- Camera soft-follow (lerp toward ship Y)
- Register game in `src/games/index.ts`
- Build passes

### Phase 2 — Vue Shell & HUD (`MoonLandingGame.vue`)
- Canvas + full-screen layout
- HUD pill: LEVEL | SCORE | FUEL bar | STREAK
- Speed/angle readout panel (V-speed, H-speed, tilt angle) — color-coded green/red
- "SAFE TO LAND" badge (driven by approach conditions)
- Desktop keyboard handler (W thrust, A/D tilt) wired to `controls` object
- Countdown overlay ("3… 2… 1… GO")
- "LANDED!" overlay with score breakdown (sequential animated +N lines)
- "CRASH" overlay with restart button
- Theme name shown during countdown
- `onMounted` / `onUnmounted` lifecycle
- Build passes

### Phase 3 — Mobile Analog Controls (sliders in Vue)
- Left thrust slider: full-height touch strip, thumb follows finger, value 0→1
- Right tilt slider: full-height touch strip, spring-back to center on release, value -1→+1
- Both sliders write into `game.controls.thrust` / `game.controls.tilt`
- Visual polish: thumb glow tracks thrust intensity, center notch on tilt track
- Touch event handling: `touchstart`, `touchmove`, `touchend` / `touchcancel`
- Prevent default scroll on slider touches
- Works correctly with multi-touch (both sliders simultaneously)
- Build passes

### Phase 4 — Planet Themes, Level Progression & Bonus Systems
- All 4 themes wired up (Moon / Mars / Venus / Jupiter) — random per session
- Theme applied to: sky color, terrain colors, particle color, lighting tints
- Level progression: terrain regenerated each level, pad narrows, altitude increases
- Bonus landing pads (gold, ×2 score)
- Floating pickups: fuel / score-multiplier / slowmo — spinning octahedra, drift + collect
- Slowmo time scale (all physics scaled by `timeScale`)
- Wind force (level 6+) with HUD arrow
- Streak counter (3 consecutive landings → bonus)
- Score breakdown: speed/accuracy/fuel/tilt components each with threshold logic
- "BULLSEYE" / "PERFECT LANDING" badge detection
- High score persistence via `localStorage`
- Build passes

### Phase 5 — Juice & Visual Polish
- Thruster particle trail (count + speed scale with `thrust` value live)
- `shipGlow` PointLight intensity tracks thrust
- Landing dust puff particles on touchdown
- Crash explosion: debris fragments (3–4 spinning lines), fire burst, dust cloud
- Landing pad approach pulses: green/red glow based on safe-to-land state
- Fuel warning: bar flickers orange < 25%, red < 10%, vignette pulses
- Speed danger: screen-edge red pulse when descending too fast near terrain
- `triggerShake` + `triggerFlash` wired to crash / landing / pickup events
- Score breakdown lines float up and fade (CSS `<Transition>` or Three.js sprites)
- Pickup collect burst (color-matched particles + flash)
- Slowmo visual: subtle blue tint overlay + slight blur on HUD text
- Build passes

### Phase 6 — Cleanup & Testing
- Remove any leftover `console.log` / debug draws
- Verify `destroy()` disposes all geometries, materials, lights
- Verify `restart()` fully resets all state (no leaked particles, no stale fuel/phase)
- Test: crash immediately on start, out-of-fuel crash, perfect landing all bonuses
- Test: theme colors correct for all 4 planets
- Test: mobile sliders work with simultaneous multi-touch
- Test: level progression — terrain changes, pad shrinks, wind appears at level 6
- Run `npm run build` — zero errors, zero warnings
- Run `npm run lint` — zero errors

---

## Concept

Side-view analog physics lander. Player pilots a descent module from altitude down to a marked landing pad using analog drag controls for thrust and tilt. One life, limited fuel, procedural terrain per game. Three alien planet themes with different gravity and visual flavour.

---

## View / Camera

```
Side view (XY plane, Y = up)
Camera: OrthographicCamera, centered on ship, scrolls vertically as ship climbs/descends
World width: fixed (~300 units, fits viewport width)
World height: terrain bottom at Y=0, spawn altitude ≈ 800–1200 units

Camera tracks ship with soft follow (lerp 4–6 /s).
On crash/land: camera freezes at final position.
```

---

## Core Physics

```
GRAVITY         per-theme (see Themes) — units/s²
MAX_THRUST      300 units/s²           (counteracts gravity when thrust=1)
THRUST_DRAG     0.98 (per frame, vel *= drag^(dt*60))  — slight damping
ANGULAR_ACCEL   4.0 rad/s²             (scaled by tilt input -1..1)
ANGULAR_DRAG    0.88 (per frame)       — rotation bleeds off quickly so it's controllable
FUEL_MAX        100
FUEL_RATE       thrust * 18 /s         — full thrust drains in ~5.5s; gentle hover drains slowly

Each frame:
  velX += sin(angle) * thrust * MAX_THRUST * dt
  velY += cos(angle) * thrust * MAX_THRUST * dt - GRAVITY * dt
  velX *= DRAG^(dt*60)
  velY *= DRAG^(dt*60)
  angularVel += tiltInput * ANGULAR_ACCEL * dt
  angularVel *= ANGULAR_DRAG^(dt*60)
  angle     += angularVel * dt
  pos       += vel * dt
  fuel      -= thrust * FUEL_RATE * dt  (floor at 0; when 0 thrust = 0)
```

---

## Landing Criteria

```
SAFE_VSPEED   45 units/s    — max downward speed to survive
SAFE_HSPEED   25 units/s    — max horizontal speed
SAFE_ANGLE    0.30 rad      — ≈ 17°, max tilt from vertical

On pad contact:
  abs(velY) <= SAFE_VSPEED  AND
  abs(velX) <= SAFE_HSPEED  AND
  abs(angle) <= SAFE_ANGLE
  → LANDED (score, juice)

Anything else on pad contact:
  → CRASH

Hit terrain (not pad):
  → CRASH always
```

Approach indicator: green glow on pad + HUD "SAFE TO LAND" when all three conditions met simultaneously. Goes orange/red if any condition fails.

---

## Terrain Generation

```
generateTerrain(seed):
  1. Create 20–28 control points from x=0 to x=worldW, random Y in [groundBase, groundBase + maxHeight]
  2. Smooth with Catmull-Rom spline
  3. Stamp 1–3 flat landing pads of width 30–60 units (guaranteed flat segments)
     - Primary pad: larger, always lower altitude, green
     - Bonus pads: smaller, awkward positions, gold (×2 score bonus)
  4. Build terrain mesh: filled polygon from spline points down to Y=0
  5. Collision: store heightmap array (one Y per integer X)

Pad difficulty increases per level:
  - Level 1: one large primary pad (60u wide), one bonus pad
  - Level 3+: primary shrinks to 40u, bonus pads may be on ledges
  - Level 6+: wind introduced (see Wind section)
```

---

## Planet Themes

```typescript
type Theme = {
  name: string;
  gravity: number;         // units/s²
  skyColor: number;        // scene background
  groundColor: number;     // terrain fill
  groundEdgeColor: number; // terrain outline / edge highlight
  starColor: number;       // star field tint
  particleColor: number;   // thruster exhaust color
  ambientColor: number;
  accentColor: number;
  dustColor: number;       // landing/crash dust
};

const THEMES = {
  moon: {
    name: 'Moon',
    gravity: 80,           // low — very floaty, forgiving
    skyColor: 0x020408,
    groundColor: 0x3a3a4a,
    groundEdgeColor: 0x8888aa,
    starColor: 0xffffff,
    particleColor: 0xaaddff,
    ambientColor: 0x334466,
    accentColor: 0x6688cc,
    dustColor: 0xccccdd,
  },
  mars: {
    name: 'Mars',
    gravity: 130,          // medium — more urgent
    skyColor: 0x100504,
    groundColor: 0x6b3020,
    groundEdgeColor: 0xcc6644,
    starColor: 0xffddcc,
    particleColor: 0xff7744,
    ambientColor: 0x663322,
    accentColor: 0xff5522,
    dustColor: 0xdd8866,
  },
  venus: {
    name: 'Venus',
    gravity: 190,          // high — challenging, punishing
    skyColor: 0x040d08,
    groundColor: 0x1a4030,
    groundEdgeColor: 0x44cc88,
    starColor: 0xaaffdd,
    particleColor: 0x44ffaa,
    ambientColor: 0x224433,
    accentColor: 0x22ffaa,
    dustColor: 0x88ffcc,
  },
  jupiter: {
    name: 'Jupiter',
    gravity: 260,          // brutal — expert only
    skyColor: 0x080601,
    groundColor: 0x5a3d10,
    groundEdgeColor: 0xffbb44,
    starColor: 0xffeeaa,
    particleColor: 0xffcc33,
    ambientColor: 0x443310,
    accentColor: 0xffaa22,
    dustColor: 0xffdd88,
  },
} as const;
```

Theme is randomly selected at game start (or player-chosen in future). Each theme shows its planet name during the "GET READY" countdown.

---

## Mobile Controls

### Left Slider — Thrust (0 → 1)

```
Full-height draggable strip on the left edge (~70px wide).
Thumb starts at BOTTOM (thrust = 0) each attempt.

thumbY = clamp(touchY, stripTop, stripBottom)
thrust = 1 - (thumbY - stripTop) / stripHeight   ← 0 at bottom, 1 at top

Visual:
  - Frosted track (bg-white/5 border)
  - Thumb: circle that follows finger, glows orange-yellow at high thrust
  - Track fill: gradient from bottom (dark) to thumb position (orange/white)
  - "THRUST" label rotated 90° on the side
  - Engine glow intensity mirrors thrust value in real-time
```

### Right Slider — Tilt (-1 → +1)

```
Full-height draggable strip on the right edge (~70px wide).
Thumb springs back to CENTER (tilt = 0) on release.

thumbY = clamp(touchY, stripTop, stripBottom)
tilt = 1 - (thumbY - stripTop) / (stripHeight / 2) - 1
     = maps [top=+1, center=0, bottom=-1]

Visual:
  - Center notch/tick mark on track
  - Thumb: circle with left/right arrow icon
  - Tilts slightly to show which direction ship will rotate
  - "TILT" label rotated 90°
  - On release: thumb animates back to center (CSS transition 150ms)
```

### Desktop Controls

```
W / ArrowUp       — thrust on (held = 1.0; tap = 0.5)
A / ArrowLeft     — tilt left  (-1.0)
D / ArrowRight    — tilt right (+1.0)
```

---

## Score System

```
BASE_SCORE       500 (each successful landing)

Multipliers stacked on top of base:
  Speed bonus:
    velY <= 10   → +200
    velY <= 25   → +100
    else         → +0

  Accuracy bonus (how centered on pad):
    center ± 5u  → +300  "BULLSEYE"
    center ± 15u → +150  "PRECISE"
    else         → +0

  Fuel bonus:
    remaining fuel × 8

  Tilt bonus:
    abs(angle) <= 0.05 rad → +150  "PERFECT VERTICAL"

  Bonus pad multiplier: ×2 on all components

  Perfect landing badge: ALL bonuses maxed → "PERFECT LANDING" flash

Score accumulates across levels in a session.
High score persisted in localStorage.
```

---

## Bonus System

### Bonus Pickups (floating in air)

Spawned 2–4 per level, drifting slowly horizontally.

```typescript
type Pickup = 'fuel' | 'score' | 'slowmo';

fuel:   +35 fuel, gold particle burst, flash gold
score:  ×1.5 score multiplier for this landing (stacks once), cyan flash
slowmo: time scale → 0.35 for 4s (gravity/vel scaled by timeScale), blue flash
```

Pickup geometry: spinning octahedron (like Snake multiplier food). Collected on proximity < 15u.

### Streak Bonus

Landing 3 consecutive levels without crash → "STREAK ×3" badge, +500 bonus.

### Speed Run Mode (per level)

Each level has a par time (generous). Beat it → +200 pts bonus.

---

## Visual Effects / Juice

### Thruster Exhaust
```
spawnParticles(rearOfShip, 3 every 30ms, theme.particleColor, speed = thrust * 2.5)
Particles have gravity component (fall downward naturally)
Glow light at rear of ship: PointLight intensity = thrust * 8, color = theme.particleColor
```

### Landing Pad Approach Indicator
```
Pad mesh pulses green when safe-to-land conditions met:
  padMat.emissiveIntensity = 0.5 + sin(globalTime * 6) * 0.4
Red pulse when any condition fails.
Arrow indicators on pad edges point up toward ship.
```

### Crash
```
spawnParticles(pos, 80, theme.dustColor)    — large dust cloud
spawnParticles(pos, 40, 0xff4400)           — fire burst
spawnParticles(pos, 20, 0xffffff)           — white sparks
triggerShake(0.8)
triggerFlash(pos, 0xff4400, 25)
Ship mesh replaced by debris (3–4 fragment lines, spinning outward)
Camera freeze on impact
"CRASH" red text fades in
```

### Successful Landing
```
spawnParticles(pos, 40, theme.dustColor)    — landing dust puff
spawnParticles(pos, 12, 0xffffff)           — sparkle
triggerShake(0.25)
triggerFlash(pos, 0x88ff44, 12)
Landing pad lights burst (ring of particles outward)
Score breakdown floats up in sequence (+X pts each component, 300ms apart)
"LANDED!" text with sub-text "PERFECT LANDING" if applicable
```

### Fuel Warning
```
fuel < 25%: HUD fuel bar flickers orange
fuel < 10%: flicker red, ship engine glow flickers, screen vignette pulses
fuel = 0:   all thrust cut, "NO FUEL" flash, ship is at gravity's mercy
```

### Altitude Danger Zone
```
altitude < 120u + terrain:
  speed > SAFE_VSPEED → screen edges pulse red
```

### Dynamic Lighting
```
accentLight: orbits offscreen, grazes terrain surface — slow, dramatic
shipGlow: PointLight follows ship, intensity 2 + sin(t*2)*0.5, color = theme.accentColor
thrusterGlow: rear of ship, intensity = thrust * 8
flashLight: used for crash / land events
```

---

## Wind (Level 6+)

```
windForce: number           // -40 to +40 units/s² (changes per level)
velX += windForce * dt

HUD: wind direction arrow + magnitude
Visual: particle stream blowing across screen (sparse, slow)
```

---

## Level Progression

```
Level 1: Moon, wide pad, no wind, low altitude spawn
Level 2: Mars OR Venus (random), medium pad
Level 3+: random theme each level, pad narrows, altitude increases
Level 6+: wind introduced
Level 10+: wind gusts (windForce changes mid-flight over 3s intervals)

Spawn altitude: 600 + level * 50 (capped at 1400)
Ship always spawns directly above primary landing pad ± 60u horizontal offset
```

---

## HUD Layout

```
Top center pill (same pattern as other games):
  LEVEL N | SCORE XXXXX | FUEL [████░░] | STREAK ×N

Right of center, below pill:
  ↕ V-SPEED: XX.X  (green if safe, red if not)
  ↔ H-SPEED: XX.X  (green if safe, red if not)
  ↻ ANGLE: XX°      (green if safe, red if not)

Bottom center (desktop only):
  W thrust  |  A/D tilt

Approach helper (when altitude < 200u from nearest pad):
  "SAFE TO LAND" badge glows green when all conditions met
```

---

## Scene / Z-Layers

```
Stars:          Z = -1
Terrain fill:   Z = 0
Terrain edge:   Z = 0.05
Landing pads:   Z = 0.08
Pickups:        Z = 0.20
Ship:           Z = 0.30
Thruster flame: Z = 0.32
Debris:         Z = 0.30
Particles:      Z = 0.50
HUD lights:     Z (3D point lights, not layers)
```

---

## State Shape

```typescript
type Phase = 'countdown' | 'flying' | 'landed' | 'crashed' | 'gameover';

// Game-level
let phase: Phase;
let level: number;
let score: number;
let streak: number;
let globalTime: number;
let timeScale: number;   // 1.0 normally; 0.35 during slowmo pickup
let fuel: number;        // 0–100
let shakeAmt: number;
let flashIntensity: number;

// Ship
let shipPos: THREE.Vector2;
let shipVel: THREE.Vector2;
let shipAngle: number;        // radians from vertical; 0 = straight up
let angularVel: number;

// Controls (exposed to Vue for mobile sliders)
const controls = { thrust: 0, tilt: 0 };   // thrust 0–1, tilt -1..+1

// Terrain (per level)
type TerrainPoint = { x: number; y: number };
let terrainPoints: TerrainPoint[];
let heightmap: Float32Array;   // one Y value per integer X world unit
type Pad = { x: number; centerY: number; width: number; isBonus: boolean };
let pads: Pad[];

// Pickups
type Pickup = { mesh: THREE.Mesh; type: 'fuel' | 'score' | 'slowmo'; x: number; y: number; driftVx: number };
let pickups: Pickup[];

// Theme
let theme: Theme;
```

---

## Callbacks Interface

```typescript
export type Callbacks = {
  onScore:     (s: number)      => void;
  onLevel:     (l: number)      => void;
  onFuel:      (f: number)      => void;    // 0–100
  onStreak:    (s: number)      => void;
  onPhase:     (p: Phase)       => void;
  onLanded:    (breakdown: ScoreBreakdown) => void;
  onGameOver:  ()               => void;
  onTheme:     (name: string)   => void;
};
```

---

## Public API

```typescript
{
  controls: { thrust: number; tilt: number },  // mutated by Vue sliders
  restart(): void,
  destroy(): void,
}
```

---

## Cleanup

```
destroy():
  cancelAnimationFrame
  resizeObserver.disconnect
  removeEventListeners
  cleanParticles()
  disposeTerrainMesh()
  disposeShip()
  disposePickups()
  renderer.dispose()

restart() / nextLevel():
  clearParticles, clearPickups
  regenerate terrain (new seed)
  pick new theme
  reset ship position / velocity / angle
  reset fuel = 100
  reset timeScale = 1
```

---

## Baseline Before (nothing exists yet)

This is a brand-new game. No prior version.

---

## Open Questions / Decisions

- Tilt slider: spring-back to center on release? (Yes — easier for beginners, feels more responsive)
- Camera: always centered on ship, or fixed once ship goes below certain altitude? → track ship always, pad always visible near bottom
- Multiple levels in one "session" (accumulate score) or each level standalone? → accumulate, session ends on crash
- Theme selector on home screen before game starts, or random? → random each session, shown in countdown

