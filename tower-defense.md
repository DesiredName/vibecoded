# Tower Defense Game — Logic Flow & Juice Changes

Files: `src/games/tower-defense/game.ts`, `src/games/tower-defense/TowerDefenseGame.vue`

---

## Core Game Loop

```
requestAnimationFrame(tick)
  │
  ├── compute dt (capped at 50ms)
  ├── orbit accentLight (XY plane, 0.5 rad/s)
  ├── decay flashLight (exponential ×e^{-10dt})
  ├── apply / decay screen shake (exponential ×e^{-6dt}, camera XY offset)
  ├── tower spawnAnim pop (0 → 1 over 0.2s with 35% overshoot)
  ├── updateParticles(dt)
  │
  ├── if phase === 'prep':
  │     prepTimer -= dt → onPrepTimer
  │     prepTimer <= 0 → startWave()
  │
  └── if phase === 'wave':
        ├── spawn enemies on spawnTimer interval
        ├── move all enemies along path
        ├── handle escaped enemies (life loss, juice)
        ├── towers scan range → fireAt → spawn projectile
        ├── move projectiles → applyDamage on hit
        ├── remove dead enemies (juice)
        └── wave complete check → prep phase
```

### startWave()
```
wave++
enemiesToSpawn = 4 + wave * 2
phase = 'wave'
triggerShake(0.15)
triggerFlash(4, startCell, 0x4488ff)
```

### Enemy death
```
spawnParticles(20, pos, enemyColor)
triggerFlash(8, pos, enemyColor)
triggerShake(0.08)
score++
gold += 8 + wave * 2
```

### Enemy escape (reaches end)
```
spawnParticles(15, pos, 0xff2233)
triggerFlash(5, pos, 0xff2200)
triggerShake(0.3)
lives--
if lives <= 0: triggerShake(0.6), isGameOver = true
```

---

## State Shape

```typescript
// Game-level
let wave: number;
let phase: Phase;        // 'prep' | 'wave'
let prepTimer: number;   // counts down from PREP_TIME=6s
let gold: number;
let lives: number;
let score: number;
let isGameOver: boolean;
let enemiesToSpawn: number;
let spawnTimer: number;

// Per-tower
type Tower = {
  col: number; row: number;
  type: TowerType;         // 'basic' | 'sniper' | 'splash'
  mesh: THREE.Mesh;
  cooldown: number;        // time until next shot
  spawnAnim: number;       // 0 → 1 for placement pop animation
};

// Per-enemy
type Enemy = {
  id: number;
  pathIdx: number;         // current path segment index
  progress: number;        // 0→1 interpolation along current segment
  hp: number; maxHp: number;
  armor: number;           // damage reduction fraction (0–0.60)
  speed: number;           // path units per second
  baseEmissive: number;    // normal emissive color
  flashTimer: number;      // 0.12s white flash on hit
  mesh: THREE.Mesh;
  hpBg: THREE.Mesh;        // health bar background
  hpFg: THREE.Mesh;        // health bar foreground (scales.x = hp/maxHp)
};

// Per-projectile
type Projectile = {
  mesh: THREE.Mesh;
  targetId: number;        // tracks target by id even as it moves
  damage: number;          // pre-scaled by wave bonus
  splash: number;          // splash radius (0 = no splash)
};
```

---

## Coordinate System

```
Grid:   16 cols × 10 rows
World:  cellWorld(col, row) = (col - 8 + 0.5, 5 - row - 0.5)
  col  → world X  (left = negative, right = positive)
  row  → world Y  (top = positive, bottom = negative, inverted)

Camera: OrthographicCamera, position (0, 0, 20), looking along -Z
  → pure top-down 2D view; Z is depth / render order only
  → frustum adjusts to canvas aspect ratio with 0.4 unit padding

Cells at Z = -0.04 (ground)
Towers, enemies at Z = 0.35 (above ground)
Projectiles at Z = 0.40
HP bars at Z = 0.55–0.58
Particles at Z = 0.70 (on top of everything)
```

---

## Map Generation

```
generateMap():
  Tries density values 0.38 → 0.05 (step -0.05), 25 attempts each
  Per attempt:
    random startRow, endRow (rows 1..ROWS-2)
    random wall grid at given density
    A* path from col=0 to col=15
    accept if path.length >= COLS (forces winding path)
  Fallback: straight horizontal path through middle row

A* is 4-directional Manhattan heuristic; walls block movement.
```

---

## Tower Definitions

```typescript
export const TOWER_DEFS = {
  basic:  { range: 3.0, damage: 30,  fireRate: 1.0, splash: 0,   cost: 50,  color: 0x00aaff },
  sniper: { range: 6.0, damage: 120, fireRate: 0.4, splash: 0,   cost: 100, color: 0x9933ff },
  splash: { range: 2.5, damage: 40,  fireRate: 0.7, splash: 1.2, cost: 150, color: 0xff6600 },
}
```

Tower placement rules:
- Cell must be `'empty'` (not path/wall/start/end)
- Only one tower per cell
- Must have enough gold

Tower targeting: picks the furthest-progressed enemy within range (`pathIdx + progress`).

### Wave-Scaled Tower Damage

```
scaledDamage = stats.damage * Math.pow(1.01, max(0, wave - 1))
```

Applied at projectile creation time (stored in `Projectile.damage`).
- Wave 1: ×1.000 (no bonus)
- Wave 10: ×1.094 (+9.4%)
- Wave 20: ×1.208 (+20.8%)

---

## Enemy Scaling (Balance)

```typescript
function enemyStats(w: number) {
  return {
    hp:    Math.round(80 * Math.pow(1.15, w - 1)),
    armor: Math.min(0.60, (w - 1) * 0.0025),
    speed: 1.5 + (w - 1) * 0.08,
  };
}
```

| Wave | HP   | Armor | Speed |
|------|------|-------|-------|
| 1    | 80   | 0%    | 1.50  |
| 5    | 140  | 1%    | 1.82  |
| 10   | 314  | 2.25% | 2.22  |
| 20   | 992  | 4.75% | 3.02  |
| 40   | 9895 | 9.75% | 4.62  |

Armor caps at 60%. Damage after armor: `max(1, round(damage × (1 - armor)))`.

Wave spawns: `4 + wave × 2` enemies per wave (wave 1 = 6, wave 10 = 24).
Spawn interval: `SPAWN_INTERVAL = 0.55s`.
Gold per kill: `8 + wave × 2`. Wave-end bonus: `15 + wave × 5`.

---

## Sell Mode

`sellTower(col, row): number` — returns gold refunded (50% of cost), or 0 if no tower.

```typescript
refund = Math.floor(TOWER_DEFS[t.type].cost * 0.5)
```

On sell: removes mesh from scene, disposes material, adds gold, triggers particles + flash + shake.

Vue UX pattern:
1. "Sell" button in bottom bar (beside tower type buttons)
2. Tap → `sellMode = true`, red hint banner appears: "Tap a tower to sell it for 50%"
3. Tap a tower cell → sold, "+Xg sold" toast shown, sell mode auto-exits
4. Tap sell button again → sell mode exits (toggle)
5. Tap any tower type button → sell mode exits, tower type selected

Sell does NOT work during game over.

---

## Projectile System

```
PROJ_SPEED = 12 units/s

Each frame, projectile moves toward its target's current position.
Hit threshold: dist < 0.22 world units.
If target already dead: projectile removed without damage.
On hit: applyDamage(targetId, damage, splash)
```

Splash damage:
- Finds all enemies within `splash` radius of the target
- Each takes `max(1, round(damage × (1 - armor)))` damage
- All get `flashTimer = 0.12`

Projectile colors:
- Basic: `0xffff44` (yellow)
- Sniper: `0xcc88ff` (purple)
- Splash: `0xffaa00` (orange)

---

## Particle System

```typescript
type Particle = {
  mesh: THREE.Mesh;   // shared particleGeo (SphereGeometry r=0.08)
  vx: number;         // initial random direction (radial XY burst)
  vy: number;
  life: number;       // 1 → 0
  maxLife: number;    // 0.3–0.65s randomized per particle
};
```

Physics per frame:
```
friction = exp(-3 * dt)  // velocity damping
vx *= friction; vy *= friction
pos.xy += vel * dt
opacity = min(1, life * 2)   // fade in final 50% of life
scale   = 0.3 + life * 0.7   // shrink as they die
```

Spawn counts:
| Event | Count | Color |
|---|---|---|
| Enemy death (wave < 5) | 20 | `0xff2233` (red) |
| Enemy death (wave ≥ 5) | 20 | `0xff5500` (orange-red) |
| Enemy escape | 15 | `0xff2233` (red) |
| Tower placed | 10 | tower color |
| Tower sold | 12 | `0xffd700` (gold) |

Materials created per-particle, disposed on removal. Geometry is shared (`particleGeo`).
Particles spawn at Z=0.7 (renders above all game objects).

---

## Screen Shake

```typescript
let shakeAmt = 0;
// exponential decay each frame:
shakeAmt *= Math.exp(-6 * dt)
// camera XY offset while shakeAmt > 0.002:
camera.position.set(
  (random - 0.5) * shakeAmt * 0.8,  // X offset
  (random - 0.5) * shakeAmt * 0.8,  // Y offset
  20,                                 // Z unchanged
)
```

No `lookAt` call during shake — camera keeps top-down orientation by default. Only XY translation changes.

Trigger values:
| Event | shakeAmt |
|---|---|
| Tower placed | 0.04 |
| Tower sold | 0.03 |
| Enemy death | 0.08 |
| Enemy escape | 0.30 |
| Game over | 0.60 |
| Wave start | 0.15 |

---

## Flash Light

`flashLight` (PointLight, range 12) positioned at event location, Z=2:
```
flashIntensity *= Math.exp(-10 * dt)
flashLight.intensity = flashIntensity
```

| Event | intensity | color |
|---|---|---|
| Tower placed | 3 | tower color |
| Tower sold | 4 | `0xffd700` (gold) |
| Enemy death | 8 | enemy color |
| Enemy escape | 5 | `0xff2200` (red) |
| Wave start | 4 | `0x4488ff` (blue) |

---

## Accent Light

`accentLight` (PointLight, intensity 0.7, range 14) orbits the grid in the XY plane:
```
accentAngle += dt * 0.5   // 0.5 rad/s
accentLight.position = (cos(accentAngle) * 6, sin(accentAngle) * 3.5, 3)
```

Creates moving highlights across cells, towers, and enemies.

---

## Tower Spawn Animation

```typescript
// spawnAnim: 0 → 1 over 0.2s
t.spawnAnim = min(1, t.spawnAnim + dt / 0.2)

// scale with 35% overshoot:
if spawnAnim < 0.6:
  scale = spawnAnim / 0.6                                         // linear 0 → 1
else:
  scale = 1 + 0.35 * sin(((spawnAnim - 0.6) / 0.4) * PI)        // bounce 1 → 1.35 → 1
```

Tower mesh starts at `scale(0)` when added to scene. The pop plays each placement.

---

## Vue Component (`TowerDefenseGame.vue`)

- `sellMode: ref(false)` — sell mode active flag
- `soldLabel: ref('')` — "+Xg sold" toast, auto-clears after 1400ms
- `selectTower(type)` — sets selected tower type AND exits sell mode
- `onCanvasClick` routes to sell or place depending on `sellMode`
- Sell button: last item in bottom bar, red highlight when active
- "Tap a tower to sell it for 50%" hint banner above bar (visible when `sellMode`)
- `onGameOver` callback resets `sellMode = false`
- `restart()` resets `sellMode`, `soldLabel`, `showNoGold`
- `soldTimer` cleared on `onUnmounted`

---

## Callbacks Interface

```typescript
export type Callbacks = {
  onWave:      (n: number) => void;
  onGold:      (g: number) => void;
  onScore:     (s: number) => void;
  onLives:     (l: number) => void;
  onPhase:     (p: Phase)  => void;
  onPrepTimer: (s: number) => void;
  onGameOver:  ()          => void;
};
```

---

## Public API (return object)

```typescript
{
  canvasToCell(clientX, clientY): { col, row } | null,
  placeTower(col, row, type): boolean,  // false = can't place (wrong cell / no gold / game over)
  sellTower(col, row): number,          // returns gold refunded; 0 = no tower there
  restart(): void,
  destroy(): void,
}
```

---

## Cleanup

`destroy()` and `restart()` both call `clearAll()`:
```typescript
function clearAll() {
  enemies.forEach(removeEnemy);
  enemies = [];
  projectiles.forEach(removeProj);
  projectiles = [];
  towers.forEach(t => { scene.remove(t.mesh); material.dispose(); });
  towers.length = 0;
  cleanParticles();
}
```

`cleanParticles()`:
```typescript
for (const p of particles) {
  scene.remove(p.mesh);
  (p.mesh.material as THREE.MeshBasicMaterial).dispose();
}
particles.length = 0;
```

`restart()` also resets: `shakeAmt = 0`, `flashIntensity = 0`, `flashLight.intensity = 0`, and regenerates a new random map.

`destroy()` additionally disposes: `cellGeo`, `towerGeo`, `enemyGeo`, `projGeo`, `hpBgGeo`, `hpFgGeo`, `particleGeo`, `renderer`.

---

## What Was There Before (original baseline)

- No particles, no screen shake, no flash light, no accent orbit light
- No tower spawn animation
- No sell mode
- Enemy HP: `80 × 1.22^{wave-1}` (steeper HP curve)
- Enemy armor: `(wave-1) × 0.025` (10× faster armor accumulation)
- Tower damage: flat `stats.damage`, no wave scaling
- `clearAll()` did not call `cleanParticles()` (particles didn't exist)
- `restart()` did not reset shake/flash state (those didn't exist)
