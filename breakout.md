# Breakout Game — Logic Flow & Juice Changes

Files: `src/games/breakout/game.ts`, `src/games/breakout/BreakoutGame.vue`

---

## Core Game Loop

```
requestAnimationFrame(loop)
  │
  ├── compute dt (capped at 50ms)
  ├── update(dt)
  │     ├── paddle appearance (color / scale based on active power)
  │     ├── keyboard input → targetX, smooth lerp → paddleX
  │     ├── combo decay timer
  │     ├── power drops: fall physics, paddle catch → applyPower
  │     ├── if waiting: ball follows paddle
  │     └── if playing: for each ball in balls[]
  │           ├── move ball (vx/vz * dt)
  │           ├── side wall bounce
  │           ├── top wall bounce
  │           ├── bottom exit → destroyBall, lives--, resetBall or gameOver
  │           ├── paddle collision → reflect + angle redirect, combo reset
  │           ├── brick collisions → bounce (unless fireball), breakBrick
  │           └── update trail meshes (7 ghost copies)
  ├── updateParticles(dt)
  ├── flash light exponential decay
  ├── screen shake exponential decay
  ├── accent light orbit
  ├── ball glow pulse
  └── renderer.render(scene, camera)
```

### update(dt) — ball physics detail

```
1. determine pW (PADDLE_W_BASE or PADDLE_W_WIDE if wideUntil active)
2. paddleMesh.scale.x = pW / PADDLE_W_BASE  (visual stretch)
3. smooth paddle lerp: paddleX += (targetX - paddleX) * min(1, dt*16)
4. combo decay: comboTimer -= dt; if <= 0 reset combo to 0
5. power drops fall at 9 units/s; catch if within paddle+0.4 bounds

Per ball:
  a. prevX = ball.x, prevZ = ball.z   (for trail)
  b. ball.x += vx*dt, ball.z += vz*dt
  c. wall bounces (left/right/top) with triggerShake(0.02)
  d. if ball.z > AREA_H/2+2:
       spawnParticles(red), destroyBall, balls.splice
       if balls empty: lives--, onLives, gameOver or resetBall
  e. paddle AABB + overlap test → vz = -|vz|, vx = rel * 0.8 * BALL_SPEED
       renormalize to BALL_SPEED, reset combo, spawnParticles(blue)
  f. brick AABB loop:
       overlapX vs overlapZ → flip vx or vz (skipped if fireball)
       combo++, comboTimer reset, breakBrick(brick)
       break after first hit (fireball: continue through all)
  g. trail shift: trailPos[1..N] = trailPos[0..N-1], trailPos[0] = {prevX, prevZ}
       update TRAIL_LEN=7 ghost meshes (opacity, scale, color)
  h. ball.mesh / glow color = fireball orange or default blue
```

### breakBrick(brick, fromChain?)

```
1. brick.hp--
2. if hp > 0:
     dispose old material, assign cracked material (darkened + high roughness)
     spawnParticles(10, brick.color), triggerFlash(3), triggerShake(0.05)
     return
3. brick.alive = false, scene.remove(brick.mesh)
4. pts = 10 * comboMult() * kindMultiplier   (hard=×2, explosive=×3)
5. score += pts, cb.onScore
6. spawnParticles(60 if explosive else 25, brick.color)
7. triggerFlash(15 if explosive else 6, brick.color)
8. triggerShake(0.25 if explosive else 0.08)
9. if !fromChain: spawnPowerDrop(25% chance)
10. if explosive: for each alive neighbor (|dcol|≤1 && |drow|≤1): breakBrick(other, true)
11. if gameState==='playing' && bricks.every(!alive): gameState='won', cb.onWin()
```

---

## State Shape

```typescript
// per-ball
type Ball = {
  x: number; z: number;       // world position
  vx: number; vz: number;     // velocity (units/s)
  mesh: THREE.Mesh;
  glow: THREE.PointLight;
  trail: THREE.Mesh[];        // TRAIL_LEN=7 ghost copies
  trailPos: {x,z}[];         // previous positions, head = oldest-1 frame
};

// per-brick
type Brick = {
  x: number; z: number;
  mesh: THREE.Mesh;
  alive: boolean;
  hp: number; maxHp: number;  // hard bricks: maxHp=2; normal/explosive: 1
  kind: BrickKind;            // 'normal' | 'hard' | 'explosive'
  color: number;              // hex, from BRICK_COLORS[row % 6]
  col: number; row: number;   // grid indices for neighbor lookup
};

// game-level
let paddleX: number;
let targetX: number;
let score: number;
let lives: number;           // starts at 3
let gameState: GameState;    // 'waiting' | 'playing' | 'dead' | 'won'
let wideUntil: number;       // performance.now() timestamp; 0 = inactive
let fireUntil: number;       // same
let combo: number;           // consecutive brick hits without paddle touch
let comboTimer: number;      // COMBO_WINDOW=2.5s countdown
const balls: Ball[];         // array; supports multi-ball
const bricks: Brick[];       // all 48 bricks, dead ones stay in array (alive=false)
const powerDrops: PowerDrop[];
```

---

## Coordinate System

```
Play area: AREA_W=14 × AREA_H=20 (world units)
Floor:     PlaneGeometry(14, 20), Y=0
Walls:     left at X=-7.25, right at X=+7.25, top at Z=-10.25

Camera: PerspectiveCamera at (0, 22, 9), lookAt origin
  → angled bird's-eye, slightly toward viewer

Paddle: at Z = AREA_H/2 - 1 = +9  (closest row to viewer)
Bricks: rows start at Z = -AREA_H/2 + 2 = -8, stepping by BRICK_D+BRICK_GAP_Z=0.87
Ball:   Y = BALL_R + 0.05 = 0.4 (rests on floor plane)

2D physics in XZ plane; Y is constant for ball.
```

---

## Ball System

```
BALL_SPEED = 9 units/s (constant — renormalized after paddle redirect)
BALL_R     = 0.35

Single ball on start; multi-ball power-up adds 2 more.
All balls in balls[] are updated each frame.
When a ball exits Z > AREA_H/2+2: destroyBall, remove from array.
If balls.length === 0 after removal: lives--, resetBall or gameOver.

Paddle redirect:
  rel = clamp((ball.x - paddleX) / (pW/2), -1, 1)   [-1=far left, +1=far right]
  vx  = rel * BALL_SPEED * 0.8
  renormalize: vx = (vx/spd)*BALL_SPEED, vz = (vz/spd)*BALL_SPEED
  → always exits at BALL_SPEED, angle biased by hit position
```

---

## Brick Grid

```
BRICK_COLS = 8, BRICK_ROWS = 6
BRICK_W = 1.4, BRICK_D = 0.55
BRICK_GAP_X = 0.15, BRICK_GAP_Z = 0.32

Row assignment (top→bottom):
  rows 0-1 → 'hard'      (2 HP, darkens + roughens on crack)
  rows 2-5 → 10% chance 'explosive', rest 'normal'

Colors cycle by row (6 colors):
  0: 0xff2255 (pink-red)
  1: 0xff6600 (orange)
  2: 0xffcc00 (yellow)
  3: 0x00cc66 (green)
  4: 0x4488ff (blue)
  5: 0xaa44ff (purple)

Hard brick cracked state:
  color = darken(original, 0.45)
  emissiveIntensity = 0.05  (from 0.25)
  roughness = 0.95          (from 0.3)

Explosive brick appearance:
  emissive = 0xff5500 (bright orange)
  emissiveIntensity = 0.8   (pulsing orange glow)
```

---

## Speed & Sizing

```
BALL_SPEED = 9 units/s  (constant, not escalating)
dt capped at 50ms       (avoids tunneling on tab-suspend)
Paddle lerp:            paddleX += (targetX - paddleX) * min(1, dt*16)
Paddle speed (keys):    12 units/s
Power-drop fall speed:  9 units/s
```

---

## Combo System

```
combo: number     increments every brick hit (any ball)
comboTimer: float reset to COMBO_WINDOW=2.5s on each hit; counts down

Resets to 0:
  - paddle touch (any ball)
  - ball lost (last ball falls)
  - restart

comboMult():
  combo ≥ 8 → 5×
  combo ≥ 5 → 3×
  combo ≥ 3 → 2×
  else      → 1×

Points per brick:
  pts = 10 * comboMult() * kindMult
  kindMult: normal=1, hard=2, explosive=3

cb.onCombo(combo) fired on every change (increment or reset).
Vue shows badge when combo ≥ 3.
```

---

## Power-Up System

Every destroyed brick (not chain-killed) has a 25% chance to drop a power-up.
Drops fall at 9 units/s. Caught when within `pW/2 + 0.4` of paddle center.

| Kind | Color | Effect | Duration |
|---|---|---|---|
| `wide` | Blue `0x4499ff` | Paddle 5.5 wide (was 3.2) | 8 seconds |
| `multi` | Green `0x00ff88` | +2 extra balls spawned ±0.5 rad from ball[0] | instant (permanent until lost) |
| `fireball` | Orange `0xff4400` | Ball passes through bricks without bouncing | 5 seconds |

Visual: spinning `OctahedronGeometry(0.35)` + matching PointLight(3, range 3).
Rotation: `.rotation.y += 3*dt`, `.rotation.x += 1.5*dt` each frame.

Power-up active effects on paddle:
```
fireball active → emissive=0xff2200, emissiveIntensity=0.9, glow=0xff4400
wide active     → emissive=0x2299ff, emissiveIntensity=0.7, glow=0x44aaff
none            → emissive=0x2255cc, emissiveIntensity=0.45, glow=0x4499ff
paddleMesh.scale.x = pW / PADDLE_W_BASE  (visual stretch)
```

`PADDLE_LIMIT = AREA_W/2 - pW/2` updates dynamically with paddle width.

---

## Explosive Chain Reaction

When an explosive brick is fully destroyed:
```
for each other alive brick:
  if |other.col - brick.col| ≤ 1 && |other.row - brick.row| ≤ 1 && other ≠ brick:
    breakBrick(other, fromChain=true)
```
- `fromChain=true` suppresses power-up drops from chained kills.
- Chain is safe: `!brick.alive` check at top of breakBrick prevents cycles.
- Chained explosives DO chain further (full cascade possible).
- Chain kills earn score (with current combo multiplier).

---

## Ball Trail

```typescript
TRAIL_LEN = 7  // ghost copies

trailPos[0] = {prevX, prevZ}  (one frame behind ball)
trailPos[1..N-1] = shifted    (older frames)

Per trail mesh i:
  frac = (TRAIL_LEN - 1 - i) / TRAIL_LEN   (1.0 = newest, 0.0 = oldest)
  position = trailPos[i] at Y = BALL_R + 0.05
  opacity  = frac * 0.45
  scale    = 0.35 + frac * 0.65
  color    = 0xff4400 (fireball) or 0x88ccff (normal)
```

Trail geometry is `SphereGeometry(BALL_R * 0.75, 8, 6)` — slightly smaller than ball.
Materials created per trail mesh on `createBall`, disposed on `destroyBall`.

---

## Particle System

```typescript
type Particle = {
  mesh: THREE.Mesh;   // shared particleGeo (SphereGeometry r=0.1)
  vel: THREE.Vector3; // random spread + upward bias
  life: number;       // 1 → 0
  maxLife: number;    // 0.3–0.7s randomized
};
```

Physics per frame:
```
vel.y -= 12 * dt           // gravity
pos  += vel * dt
opacity = min(1, life * 2) // fade in final 50%
scale   = 0.3 + life * 0.7 // shrink as they die
```

Velocity direction: `theta = random * 2π`, XZ spread constrained to 0.4× of speed.

Spawn counts:
| Event | Count | Color |
|---|---|---|
| Normal brick break | 25 | brick color |
| Explosive brick break | 60 | brick color |
| Hard brick crack (not destroyed) | 10 | brick color |
| Paddle hit | 8 | `0x4499ff` (blue) |
| Ball lost | 15 | `0xff3333` (red) |
| Power-up caught | 20 | power-up color |

Materials created per-particle and disposed on removal. Geometry is shared (`particleGeo`).

---

## Screen Shake

```typescript
let shakeAmt = 0;
// exponential decay each frame:
shakeAmt *= Math.exp(-6 * dt)
// camera offset while shakeAmt > 0.002:
camera.position = camBase + random(-1,1) * shakeAmt * [2, 1, 2]
camera.lookAt(0, 0, 0)
```

Trigger values:
| Event | shakeAmt |
|---|---|
| Wall bounce | 0.02 |
| Paddle hit | 0.04 |
| Hard brick crack | 0.05 |
| Normal brick destroy | 0.08 |
| Power-up caught | 0.12 |
| Explosive brick destroy | 0.25 |
| Ball lost (not last) | 0.3 |
| Game over (last ball) | 0.5 |

---

## Flash Light

`flashLight` (PointLight, range 14) positioned at event location, decays:
```
flashIntensity *= Math.exp(-10 * dt)
```

| Event | intensity | color |
|---|---|---|
| Hard brick crack | 3 | brick color |
| Normal brick destroy | 6 | brick color |
| Power-up caught | 10 | power-up color |
| Explosive brick destroy | 15 | brick color |

---

## Vue Component Additions (`BreakoutGame.vue`)

- `combo: ref(0)` — raw consecutive hit count from `onCombo` callback
- `powerUpLabel: ref('')` — shown in a `<Transition name="powerup">` banner
- `comboLabel: computed` — `''` (hidden) / `'2× COMBO!'` / `'3× COMBO!'` / `'5× COMBO!'`
- `comboClass: computed` — yellow / orange / pink depending on multiplier level
- `powerUpClass: computed` — blue / green / orange based on `powerUpLabel` text
- `showPowerUp(label)` — sets label, clears after 2200ms via `setTimeout`
- Timer cleared on `restart()` and `onUnmounted()`
- `onCombo` + `onPowerUp` callbacks wired into `createBreakoutGame`

---

## Callbacks Interface

```typescript
export type Callbacks = {
  onScore: (s: number,) => void;
  onLives: (l: number,) => void;
  onGameOver: () => void;
  onWin: () => void;
  onCombo?: (combo: number,) => void;   // added — raw hit count; 0 = reset
  onPowerUp?: (label: string,) => void; // added — 'WIDE PADDLE' | 'MULTI-BALL' | 'FIREBALL'
};
```

---

## Cleanup

`destroy()` and `restart()` both call `cleanParticles()`:
```typescript
function cleanParticles() {
  for (const p of particles) {
    scene.remove(p.mesh);
    (p.mesh.material as THREE.MeshBasicMaterial).dispose();
  }
  particles.length = 0;
}
```

`restart()` also:
- Removes all power drops from scene
- Destroys all balls (including extra multi-ball copies)
- Resets `shakeAmt`, `flashIntensity`, `wideUntil`, `fireUntil`, `combo`
- Restores all bricks: `brick.hp = brick.maxHp`, `brick.alive = true`, material reset, re-added to scene

Ball destroy (`destroyBall`):
- Removes mesh + glow from scene
- Disposes ball's `MeshStandardMaterial`
- Removes and disposes all 7 trail meshes + their `MeshBasicMaterial`

---

## What Was There Before (original baseline)

- Single static ball; no trail; no multi-ball
- 5 brick rows, all `normal` kind (1 HP each), no hard/explosive variants
- Static paddle width, no power-ups
- No particles, no screen shake, no flash light
- No combo system — flat 10 pts per brick
- Callbacks: `onScore`, `onLives`, `onGameOver`, `onWin` only
- `accentLight` orbit + `ballGlow` intensity pulse were present
- Camera was static (no shake)
