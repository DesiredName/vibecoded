# Snake Game — Logic Flow & Juice Changes

Files: `src/games/snake/game.ts`, `src/games/snake/SnakeGame.vue`

---

## Core Game Loop

```
requestAnimationFrame(loop)
  │
  ├── compute dt (capped at 100ms to survive tab-suspend spikes)
  ├── compute tickMs = max(TICK_MIN, TICK_BASE - (snake.length - 3) * 3)
  ├── if (ts - lastTick >= tickMs) → tick()
  ├── animate food (bob, spin, light pulse)
  ├── orbit accent light
  ├── decay flash light
  ├── updateParticles(dt)
  ├── apply / decay screen shake
  ├── pulse head scale
  └── renderer.render(scene, camera)
```

### tick()
```
1. commit nextDir → dir
2. compute next head position on grid
3. check ghost mode (performance.now() < state.ghostUntil)
4. wall collision  → die()
5. self collision  → die()  [skipped during ghost mode]
6. prepend next to snake[]
7. if ate food:
     a. apply power-up effect (ghost / multiplier)
     b. calculate points (10 normal, 30 if multiplierLeft > 0)
     c. spawnParticles at food position
     d. set flashLight position + color + intensity
     e. triggerShake
     f. pickFoodType for next food
     g. rndCell for next food position
   else:
     pop tail
8. syncMeshes()
```

### syncMeshes()
```
- grow / shrink segments[] to match snake.length
- segments[0]: geometry = headGeo, material = head/ghostHead, rotation.y = dirRotationY()
- segments[1..n]: geometry = segGeo, material = body/ghostBody, rotation.y = 0
- set all segment positions from toWorld(snake[i])
- update foodMesh geometry + material based on foodType
- update foodLight color + position
```

---

## State Shape

```typescript
type State = {
  snake: Vec2[];        // head-first grid positions
  dir: Direction;       // committed direction this tick
  nextDir: Direction;   // buffered input (prevents 180° reversal)
  food: Vec2;
  foodType: FoodType;   // 'normal' | 'ghost' | 'multiplier'
  score: number;
  alive: boolean;
  ghostUntil: number;   // performance.now() timestamp; 0 = inactive
  multiplierLeft: number; // remaining multiplied food eats (3 → 0)
  eatCount: number;     // total lifetime eats, drives power-up cadence
};
```

---

## Coordinate System

```
Grid:  20×20, (0,0) top-left
World: toWorld(c) = ((c.x - 9.5) * CELL, 0, (c.y - 9.5) * CELL)
  grid x  →  world x  (left / right)
  grid y  →  world z  (up / down on screen = near / far in 3D)

Camera: PerspectiveCamera at (0, 19, 13), lookAt origin
  → bird's eye view angled slightly toward viewer
```

---

## Speed Escalation

```
TICK_BASE = 140ms   (starting speed, ~7 moves/s)
TICK_MIN  =  65ms   (max speed, ~15 moves/s)
tickMs = max(TICK_MIN, TICK_BASE - (snake.length - 3) * 3)
```

Snake grows every eat. At length 3 (start) = 140ms. At length ~29 = 65ms floor.

---

## Power-Up System

Every 5th eat (`eatCount % 5 === 4`) spawns a power-up instead of normal food (50/50 random):

| Type | Color | Shape | Effect |
|---|---|---|---|
| `normal` | Pink `0xff2255` | Icosahedron | +10 pts (or +30 with multiplier) |
| `ghost` | Blue `0x44aaff` | Smooth sphere | Pass through self for 5 seconds |
| `multiplier` | Gold `0xffcc00` | Octahedron (spiky diamond) | Next 3 foods worth 30 pts each |

`multiplierLeft` counts down from 3 as the player eats normal food.
Ghost and multiplier can stack: eat a multiplier while ghost-mode is active.

---

## Particle System

```typescript
type Particle = {
  mesh: THREE.Mesh;   // shared particleGeo (SphereGeometry r=0.1)
  vel: THREE.Vector3; // initial random direction + upward bias
  life: number;       // 1 → 0
  maxLife: number;    // 0.3–0.65s randomized per particle
};
```

Physics per frame:
```
vel.y -= 12 * dt        // gravity
pos  += vel * dt
opacity = min(1, life * 2)   // quick fade in final 50% of life
scale   = 0.3 + life * 0.7   // shrink as they die
```

Spawn counts:
- Normal eat: 20 particles, food color
- Power-up eat: 40 particles, power-up color
- Death (head): 50 green particles
- Death (body, up to 7 segments): 10 green-dark particles each

Materials are created per-particle and disposed on removal. Geometry is shared.

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
- Normal eat: 0.07  (~0.6s visible)
- Power-up eat: 0.20 (~0.9s visible)
- Death: 0.55        (~1.1s visible)

---

## Flash Light

`flashLight` (PointLight, range 10) sits at food position and decays:
```
flashIntensity *= Math.exp(-10 * dt)
```
Trigger intensities: 5 (normal eat), 12 (power-up eat). Color matches food type.

---

## Head Direction

Head geometry is a slightly elongated box `(0.78, 0.78, 0.95)` — the 0.95 axis is Z.
Rotation maps direction to world:

```
'down'  → rotation.y =  0       (+Z = snake faces toward viewer)
'right' → rotation.y = -PI/2   (+Z → +X)
'left'  → rotation.y = +PI/2   (+Z → -X)
'up'    → rotation.y =  PI     (+Z → -Z)
```

Body segments remain 0.82 cubes with no rotation.

---

## Ghost Mode Visuals

While `performance.now() < state.ghostUntil`, syncMeshes assigns:
- Head: `ghostHeadMat` — cyan-blue, transparent at 65% opacity, emissiveIntensity 0.9
- Body: `ghostBodyMat` — blue, transparent at 45% opacity, emissiveIntensity 0.4

Visual change is applied every `syncMeshes()` call (each tick), so it updates immediately even mid-frame.

---

## Vue Component Additions (`SnakeGame.vue`)

- `powerUpLabel: ref('')` — shown in a `<Transition name="powerup">` banner below the score
- `showPowerUp(label)` — sets the label, auto-clears after 2200ms via `setTimeout`
- Banner styled blue for `'GHOST MODE'`, gold for `'3X SCORE'`
- Timer cleared on `restart()` and `onUnmounted()`
- `onPowerUp` callback wired into `createSnakeGame(canvas, { ..., onPowerUp: showPowerUp })`

---

## Callbacks Interface

```typescript
type Callbacks = {
  onScore: (score: number) => void;
  onDeath: () => void;
  onPowerUp?: (label: string) => void;  // added — optional, label is 'GHOST MODE' | '3X SCORE'
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

`restart()` also resets `shakeAmt = 0`, `flashIntensity = 0`, `flashLight.intensity = 0`.

---

## What Was There Before (original baseline)

- Static green head/body cubes, all same size, no rotation
- Single static pink icosahedron food, bobbing/spinning
- Accent PointLight orbiting the grid
- Score +10 per eat, fixed 140ms tick speed
- `onScore` + `onDeath` callbacks only
- No particles, no shake, no power-ups, no flash
