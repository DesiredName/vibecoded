# Asteroids Game — Logic Flow & Juice Changes

Files: `src/games/asteroids/game.ts`, `src/games/asteroids/AsteroidsGame.vue`

---

## Core Game Loop

```
requestAnimationFrame(tick)
  │
  ├── compute dt (capped at 50ms)
  ├── globalTime += dt
  ├── orbit accentLight (XY plane, 0.35 rad/s)
  ├── decay flashLight (exponential ×e^{-8dt})
  ├── apply / decay screen shake (exponential ×e^{-6dt}, camera XY offset ×40)
  ├── combo decay timer
  ├── updateParticles(dt)
  │
  └── if !gameOver:
        ├── read keyboard + controls object
        ├── rotate ship (TURN_SPEED)
        ├── thrust → apply SHIP_ACCEL, spawn thruster particles
        ├── apply drag (SHIP_DRAG^{dt×60})
        ├── move + wrap ship position
        ├── update shipGlow + thrusterGlow positions
        ├── update shield ring (position, spin, opacity)
        ├── advance bullets (move + wrap, remove expired)
        ├── advance asteroids (move + wrap, rotate)
        ├── bullet–asteroid collision → score, combo, particles, split
        ├── ship–asteroid collision (skip if invTimer > 0) → killShip
        └── if asteroids.length === 0 → wave++, spawnWave()
```

### spawnWave()
```
triggerShake(0.25)
triggerFlash(0, 0, 0x4488ff, 12)
spawn 8×4 blue particles in ring at radius 60
invTimer = max(invTimer, 2.0)   ← wave-start invincibility
cb.onWave(wave)
spawn (4 + wave - 1) large asteroids, each:
  random position with Math.hypot(x, y) >= 80
  random direction + speed 30–60 units/s
```

### killShip()
```
if invTimer > 0: return (no-op)
spawnParticles(pos, 60, 0x00ffcc, ×1.5 speed)
spawnParticles(pos, 25, 0xffffff)
triggerShake(0.6)
triggerFlash(pos, 0x00ffcc, 20)
combo = 0, cb.onCombo(0)
lives--; cb.onLives(lives)
if lives <= 0: gameOver = true, cb.onGameOver()
else: reset ship to center, invTimer = INVINCIBLE_DURATION (2.5s)
```

---

## State Shape

```typescript
// Game-level
let score: number;
let lives: number;          // starts at 3
let wave: number;           // starts at 1, increments on wave clear
let gameOver: boolean;
let invTimer: number;       // counts down; >0 = ship invincible
let lastShot: number;       // performance.now() of last bullet fired
let globalTime: number;     // cumulative dt, drives animations
let thrustParticleTimer: number;  // countdown to next thruster particle burst
let shakeAmt: number;       // exponential decay screen shake magnitude
let flashIntensity: number; // exponential decay flash light intensity
let combo: number;          // consecutive asteroid kills within COMBO_WINDOW
let comboTimer: number;     // countdown to combo reset

// Per-asteroid
type Asteroid = {
  mesh: THREE.Line;
  velocity: THREE.Vector2;
  size: AsteroidSize;       // 'large' | 'medium' | 'small'
  radius: number;           // collision radius (matches ASTEROID_RADIUS)
  rotSpeed: number;         // rad/s, random ±0.75
};

// Per-bullet
type Bullet = {
  mesh: THREE.Points;
  velocity: THREE.Vector2;
  life: number;             // seconds remaining; removed when <= 0
};

// Per-particle
type Particle = {
  mesh: THREE.Mesh;         // shared particleGeo (CircleGeometry r=3, 4 sides)
  vx: number; vy: number;   // initial velocity (world units/s)
  life: number;             // 1 → 0
  maxLife: number;          // 0.35–0.85s randomized
};

// Touch/mobile controls (exposed in return value)
const controls = { left: false, right: false, thrust: false, fire: false };
```

---

## Coordinate System

```
World:   XY plane; Y=up, X=right
         worldH = WORLD_HALF_H = 200 (fixed)
         worldW = worldH * (canvas.width / canvas.height)  (recalculated on resize)

Camera:  OrthographicCamera at (0, 0, 10), looking along -Z
         Frustum: [-worldW, worldW] × [-worldH, worldH]
         → pure top-down 2D view; Z is depth / render order only

Wrapping: when pos.x > worldW → pos.x -= worldW*2 (and vice versa; same for Y)
          → toroidal topology, objects re-enter from the opposite edge

Ship at Z=0, asteroids at Z=0, bullets at Z=0
Particles at Z=0.5 (render above game objects)
Shield ring at Z=0.5
Lights:  shipGlow at Z=3, thrusterGlow at Z=3, flashLight at Z=5, accentLight at Z=8
```

---

## Ship Physics

```
SHIP_ACCEL   = 200 units/s²  (applied while thrusting)
SHIP_DRAG    = 0.995          (per-frame: vel *= SHIP_DRAG^{dt×60})
TURN_SPEED   = 3.2 rad/s
shipAngle    = 0 at start (pointing up)

Thrust direction:
  vx += sin(shipAngle) * SHIP_ACCEL * dt
  vy += cos(shipAngle) * SHIP_ACCEL * dt

Mesh orientation:  shipMesh.rotation.z = -shipAngle
                   flamMesh.rotation.z = -shipAngle

Invincibility flicker: floor(invTimer * 8) % 2 === 0 → visible
```

---

## Bullet System

```
BULLET_SPEED = 350 units/s
BULLET_LIFE  = 1.8 s
MAX_BULLETS  = 5 (simultaneous)
Fire cooldown: 220ms between shots

Bullet velocity = ship-forward × BULLET_SPEED + shipVel × 0.5
  → inherits some of the ship's momentum

Cannot fire while: invTimer > 0 OR gameOver

Geometry: BufferGeometry (single point at origin)
Material: PointsMaterial, color 0xffff44, size 6
Position wraps same as ship/asteroids.
```

---

## Asteroid System

```
ASTEROID_RADIUS = { large: 40, medium: 22, small: 12 }
ASTEROID_SCORE  = { large: 20, medium: 50, small: 100 }  (× comboMult)
ASTEROID_COLORS = { large: 0x6677aa, medium: 0x88aacc, small: 0xaaddff }

Geometry: BufferGeometry LINE (closed polygon)
  10–14 vertices, radius jittered ±30% per vertex for organic shape
  Colour by size: large = cool grey-blue, medium = lighter, small = bright blue-white

Spawn:
  count per wave = INITIAL_ASTEROID_COUNT + wave - 1  (4, 5, 6, …)
  size always 'large' on initial spawn
  position: random, Math.hypot(x, y) >= 80 (avoids screen centre at spawn)
  speed: 30–60 units/s, random direction

Splitting (on bullet hit):
  large  → 2× medium  (spread ±PI/2.5 from parent angle, speed ×1.4 + 40)
  medium → 2× small   (same formula)
  small  → destroyed, no children

Rotation: mesh.rotation.z += rotSpeed * dt  (random ±0.75 rad/s)
```

---

## Wave System

```
INITIAL_ASTEROID_COUNT = 4

Wave n spawns: 4 + (n-1) large asteroids = 4, 5, 6, 7, …

Wave start triggers:
  triggerShake(0.25)
  triggerFlash(0, 0, 0x4488ff, 12)
  ring of 8×4 blue particles at radius 60
  invTimer = max(invTimer, 2.0)   ← protects player from instant kill
  cb.onWave(n)

Wave complete condition: asteroids.length === 0
  (no enemies-to-spawn counter — all asteroids must be cleared)
```

---

## Combo System

```
COMBO_WINDOW = 3.0 s

combo increments on each asteroid kill (any size).
comboTimer resets to COMBO_WINDOW on each kill.
If comboTimer reaches 0 with no new kill: combo = 0, cb.onCombo(0).
combo resets to 0 on ship death (killShip).

comboMult():
  combo >= 10 → 4×
  combo >= 6  → 3×
  combo >= 3  → 2×
  else        → 1×

Score per kill: ASTEROID_SCORE[size] * comboMult()
  e.g. large at 10-combo: 20 × 4 = 80 pts
```

---

## Particle System

```typescript
type Particle = {
  mesh: THREE.Mesh;    // shared particleGeo (CircleGeometry r=3, 4 segments = diamond)
  vx: number;          // random radial direction
  vy: number;
  life: number;        // 1 → 0
  maxLife: number;     // 0.35–0.85s randomized
};
```

Physics per frame:
```
friction = exp(-2.5 * dt)   // velocity damping
vx *= friction; vy *= friction
pos.xy += vel * dt
opacity = min(1, life * 2)  // fade in final 50% of life
scale   = 0.4 + life * 0.6  // shrink as they die
```

Spawn counts / events:
| Event | Count | Color | Speed scale |
|---|---|---|---|
| Large asteroid destroyed | 36 | `0x6677aa` | 1.0 |
| Large asteroid destroyed (sparkle) | 12 | `0xffffff` | 0.5 |
| Medium asteroid destroyed | 22 | `0x88aacc` | 1.0 |
| Medium asteroid destroyed (sparkle) | 7 | `0xffffff` | 0.5 |
| Small asteroid destroyed | 12 | `0xaaddff` | 1.0 |
| Small asteroid destroyed (sparkle) | 4 | `0xffffff` | 0.5 |
| Ship death (main burst) | 60 | `0x00ffcc` | 1.5 |
| Ship death (white flash) | 25 | `0xffffff` | 1.0 |
| Thruster trail | 3 every 40ms | `0xff7700` | 0.4 |
| Wave announcement ring | 8×4 = 32 | `0x4488ff` | 0.6 |

Materials created per-particle, disposed on removal. Geometry is shared (`particleGeo`).
Particles spawn at Z=0.5 (renders above all game objects).

---

## Screen Shake

```typescript
let shakeAmt = 0;
// exponential decay each frame:
shakeAmt *= Math.exp(-6 * dt)
// camera XY offset while shakeAmt > 0.002:
camera.position.set(
  (random - 0.5) * shakeAmt * 40,   // X offset (world units)
  (random - 0.5) * shakeAmt * 40,   // Y offset
  10,                                 // Z unchanged
)
```

No `lookAt` — orthographic camera keeps top-down orientation; only XY translation changes.

Trigger values:
| Event | shakeAmt |
|---|---|
| Small asteroid destroy | 0.06 |
| Medium asteroid destroy | 0.14 |
| Large asteroid destroy | 0.28 |
| Wave start | 0.25 |
| Ship death | 0.60 |

Scale factor ×40 maps `shakeAmt` to world-unit offset.
At `shakeAmt = 0.6`: ±24 world units (~12% of worldH). Decays to imperceptible in ~0.8s.

---

## Flash Light

`flashLight` (PointLight, range 500) positioned at event location (Z=5):
```
flashIntensity *= Math.exp(-8 * dt)
flashLight.intensity = flashIntensity
```

Range 500 covers most of the visible world (worldH = 200).

| Event | intensity | color |
|---|---|---|
| Large asteroid destroy | 14 | `0x6677aa` (asteroid color) |
| Medium asteroid destroy | 8 | `0x88aacc` |
| Small asteroid destroy | 4 | `0xaaddff` |
| Wave start | 12 | `0x4488ff` (blue) |
| Ship death | 20 | `0x00ffcc` (cyan) |

---

## Ship Glow

`shipGlow` (PointLight, range 120) follows ship each frame:
```
shipGlow.position = (shipPos.x, shipPos.y, 3)
shipGlow.intensity = 3 + sin(globalTime * 2.5) * 0.7   // slow pulse
```

`thrusterGlow` (PointLight, range 80) at rear of ship:
```
thrusterX = shipPos.x - sin(shipAngle) * 14
thrusterY = shipPos.y - cos(shipAngle) * 14
thrusterGlow.position = (thrusterX, thrusterY, 3)

while thrusting:  intensity = 5 + sin(globalTime * 18) * 1.5  (fast flicker)
else:             intensity *= exp(-10 * dt)                    (quick fade-out)
```

---

## Shield Ring

Visual indicator for invincibility (both wave-start grace period and post-death respawn):
```
Geometry: RingGeometry(inner=16, outer=19, segments=28)
Material: MeshBasicMaterial, color 0x00ffcc, transparent, side=DoubleSide
Position: (shipPos.x, shipPos.y, 0.5) — follows ship each frame
Rotation: mesh.rotation.z = globalTime * 1.5  (constant spin)

While invTimer > 0:
  opacity = (sin(globalTime * 10) × 0.35 + 0.5) × min(1, invTimer / 0.5) × 0.7
  → pulses at ~1.6 Hz, fades in final 0.5s of invincibility

While invTimer === 0:
  opacity = 0 (hidden)
```

---

## Accent Light

`accentLight` (PointLight, intensity 2, range 380) orbits in the XY plane:
```
accentAngle += dt * 0.35   // 0.35 rad/s
accentLight.position = (cos(accentAngle) * 180, sin(accentAngle) * 100, 8)
```

Elliptical orbit (180 × 100) matches the screen's aspect ratio.
Creates sweeping highlights across asteroids and the ship.

---

## Invincibility

Two situations grant invincibility (`invTimer > 0`):

| Trigger | Duration |
|---|---|
| Ship death (respawn) | `INVINCIBLE_DURATION = 2.5s` |
| Wave start (new asteroids spawned) | `max(invTimer, 2.0s)` |

The wave-start grant uses `Math.max` so it never cuts a longer post-death period short.

While invincible:
- Ship and flame flicker: `floor(invTimer * 8) % 2 === 0`
- Shield ring spins and pulses (see above)
- `killShip()` is a no-op
- `fireBullet()` is blocked (can't shoot while blinking in)

---

## Vue Component (`AsteroidsGame.vue`)

- `wave: ref(1)` — current wave number shown in HUD
- `combo: ref(0)` — raw kill streak count from `onCombo` callback
- `waveLabel: ref('')` — "WAVE N" text shown for 2 seconds at wave start
- `comboLabel: computed` — `''` / `'2× COMBO!'` / `'3× COMBO!'` / `'4× COMBO!'`
- `comboClass: computed` — yellow / orange / pink depending on multiplier level
- `showWave(n)` — sets `waveLabel`, auto-clears after 2000ms via `setTimeout`
- Timer cleared on `restart()` and `onUnmounted()`
- `onCombo` + `onWave` callbacks wired into `createAsteroidsGame`
- `waveLabel` uses `<Transition name="wave-banner">` (fade + scale in/out)
- Combo badge uses `<Transition name="powerup">` (slide + fade)
- HUD: WAVE + score + lives triangles in one pill

---

## Callbacks Interface

```typescript
export type Callbacks = {
  onScore:  (s: number) => void;
  onLives:  (l: number) => void;
  onGameOver: ()        => void;
  onCombo?: (combo: number) => void;  // added — raw kill streak; 0 = reset
  onWave?:  (wave: number)  => void;  // added — fired at start of each wave
};
```

---

## Public API (return object)

```typescript
{
  controls: { left: boolean, right: boolean, thrust: boolean, fire: boolean },
  // ↑ Mutated directly by Vue component for mobile touch input

  restart(): void,
  destroy(): void,
}
```

---

## Constants Reference

```typescript
ASTEROID_RADIUS   = { large: 40, medium: 22, small: 12 }
ASTEROID_SCORE    = { large: 20, medium: 50, small: 100 }
ASTEROID_COLORS   = { large: 0x6677aa, medium: 0x88aacc, small: 0xaaddff }
BULLET_SPEED      = 350  units/s
BULLET_LIFE       = 1.8  s
SHIP_ACCEL        = 200  units/s²
SHIP_DRAG         = 0.995 (per-frame base, raised to dt×60)
TURN_SPEED        = 3.2  rad/s
MAX_BULLETS       = 5
INVINCIBLE_DURATION = 2.5 s  (post-death)
INITIAL_ASTEROID_COUNT = 4   (wave 1)
WORLD_HALF_H      = 200  units (fixed; worldW scales with aspect ratio)
COMBO_WINDOW      = 3.0  s
```

---

## Cleanup

`destroy()`:
```typescript
cancelAnimationFrame(rafId)
resizeObs.disconnect()
removeEventListeners (keydown, keyup)
clearBodies()      // removeAsteroid + removeBullet for all live objects
cleanParticles()   // scene.remove + dispose for all particles
scene.remove(shipMesh, flamMesh, starMesh, shieldMesh)
dispose: shipGeo, flamGeo, shieldGeo, shipMat, flamMat, shieldMat,
         starGeo, starMat, particleGeo, renderer
```

`restart()`:
```typescript
clearBodies(); cleanParticles()
reset: score, lives, wave, gameOver, invTimer, shakeAmt, flashIntensity,
       flashLight.intensity, thrusterGlow.intensity, combo, comboTimer,
       globalTime, shipPos, shipVel, shipAngle
restore: shipMesh.visible=true, flamMesh.visible=false, shieldMat.opacity=0
reset camera to (0, 0, 10)
fire callbacks: onScore(0), onLives(3), onCombo(0)
spawnWave()
```

---

## What Was There Before (original baseline)

- No particles, no screen shake, no flash light
- No ship glow / thruster glow / accent light (pure ambient + no dynamic lighting)
- Asteroids all drawn with `0x999999` grey regardless of size
- No shield ring — invincibility only indicated by ship flicker
- No combo system — flat score (large=20, medium=50, small=100)
- No wave invincibility — new asteroids could instantly kill the player
- No `onCombo` or `onWave` callbacks
- Vue HUD: score + lives triangles only (no wave counter, no combo badge)
- `restart()` did not reset lighting state, no particle cleanup
- `destroy()` did not dispose `shieldGeo/Mat`, `particleGeo`
