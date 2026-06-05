import * as THREE from 'three';

const COLS = 16;
const ROWS = 10;
const INITIAL_GOLD = 150;
const INITIAL_LIVES = 20;
const PREP_TIME = 6.0;
const SPAWN_INTERVAL = 0.55;
const PROJ_SPEED = 12;

export type TowerType = 'basic' | 'sniper' | 'splash';
export type Phase = 'prep' | 'wave';

export type Callbacks = {
  onWave: (n: number) => void;
  onGold: (g: number) => void;
  onScore: (s: number) => void;
  onLives: (l: number) => void;
  onPhase: (p: Phase) => void;
  onPrepTimer: (s: number) => void;
  onGameOver: () => void;
};

export const TOWER_DEFS = {
  basic:  { range: 3.0, damage: 30,  fireRate: 1.0, splash: 0,   cost: 50,  color: 0x00aaff, emissive: 0x004488, label: 'Basic'  },
  sniper: { range: 6.0, damage: 120, fireRate: 0.4, splash: 0,   cost: 100, color: 0x9933ff, emissive: 0x441166, label: 'Sniper' },
  splash: { range: 2.5, damage: 40,  fireRate: 0.7, splash: 1.2, cost: 150, color: 0xff6600, emissive: 0x883300, label: 'Splash' },
} as const;

type CellKind = 'empty' | 'path' | 'wall' | 'start' | 'end';

type Tower = {
  col: number;
  row: number;
  type: TowerType;
  mesh: THREE.Mesh;
  cooldown: number;
  spawnAnim: number;
};

type Enemy = {
  id: number;
  pathIdx: number;
  progress: number;
  hp: number;
  maxHp: number;
  armor: number;
  speed: number;
  baseEmissive: number;
  flashTimer: number;
  mesh: THREE.Mesh;
  hpBg: THREE.Mesh;
  hpFg: THREE.Mesh;
};

type Projectile = {
  mesh: THREE.Mesh;
  targetId: number;
  damage: number;
  splash: number;
};

type Particle = {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
};

function astar(
  walls: boolean[][],
  sc: number, sr: number,
  ec: number, er: number,
): [number, number][] | null {
  type N = { c: number; r: number; g: number; h: number; f: number; p: N | null };
  const key = (c: number, r: number) => c * 100 + r;
  const h = (c: number, r: number) => Math.abs(c - ec) + Math.abs(r - er);

  const open = new Map<number, N>();
  const closed = new Set<number>();
  const s: N = { c: sc, r: sr, g: 0, h: h(sc, sr), f: h(sc, sr), p: null };
  open.set(key(sc, sr), s);

  while (open.size > 0) {
    let cur: N | null = null;
    for (const n of open.values()) {
      if (!cur || n.f < cur.f) cur = n;
    }
    if (!cur) break;
    if (cur.c === ec && cur.r === er) {
      const path: [number, number][] = [];
      let node: N | null = cur;
      while (node) { path.unshift([node.c, node.r]); node = node.p; }
      return path;
    }
    open.delete(key(cur.c, cur.r));
    closed.add(key(cur.c, cur.r));
    for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
      const nc = cur.c + dc, nr = cur.r + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      if (walls[nr][nc]) continue;
      const k = key(nc, nr);
      if (closed.has(k)) continue;
      const g = cur.g + 1;
      const existing = open.get(k);
      if (!existing || g < existing.g) {
        const hn = h(nc, nr);
        open.set(k, { c: nc, r: nr, g, h: hn, f: g + hn, p: cur });
      }
    }
  }
  return null;
}

function generateMap(): { grid: CellKind[][]; path: [number, number][]; startRow: number; endRow: number } {
  for (let density = 0.38; density >= 0.05; density -= 0.05) {
    for (let attempt = 0; attempt < 25; attempt++) {
      const startRow = 1 + Math.floor(Math.random() * (ROWS - 2));
      const endRow = 1 + Math.floor(Math.random() * (ROWS - 2));
      const walls: boolean[][] = Array.from({ length: ROWS }, (_, r) =>
        Array.from({ length: COLS }, (_, c) => {
          if (c === 0 || c === COLS - 1) return false;
          if (c <= 1 && r === startRow) return false;
          if (c >= COLS - 2 && r === endRow) return false;
          return Math.random() < density;
        }),
      );
      const path = astar(walls, 0, startRow, COLS - 1, endRow);
      if (path && path.length >= COLS) {
        const grid: CellKind[][] = Array.from({ length: ROWS }, (_, r) =>
          Array.from({ length: COLS }, (_, c) => walls[r][c] ? 'wall' : 'empty'),
        );
        const pathSet = new Set(path.map(([c, r]) => `${c},${r}`));
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (pathSet.has(`${c},${r}`)) grid[r][c] = 'path';
          }
        }
        grid[startRow][0] = 'start';
        grid[endRow][COLS - 1] = 'end';
        return { grid, path, startRow, endRow };
      }
    }
  }
  const sr = Math.floor(ROWS / 2);
  const path: [number, number][] = Array.from({ length: COLS }, (_, c) => [c, sr] as [number, number]);
  const grid: CellKind[][] = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => {
      if (r !== sr) return 'empty';
      if (c === 0) return 'start';
      if (c === COLS - 1) return 'end';
      return 'path';
    }),
  );
  return { grid, path, startRow: sr, endRow: sr };
}

function cellWorld(col: number, row: number): [number, number] {
  return [col - COLS / 2 + 0.5, ROWS / 2 - row - 0.5];
}

const CELL_COLORS: Record<CellKind, number> = {
  empty: 0x0f1822,
  path:  0x1e2c3c,
  wall:  0x070c12,
  start: 0x0d3320,
  end:   0x330d0d,
};

export function createTowerDefenseGame(canvas: HTMLCanvasElement, cb: Callbacks) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080d14);

  const camera = new THREE.OrthographicCamera(-COLS / 2, COLS / 2, ROWS / 2, -ROWS / 2, 0.1, 100);
  camera.position.set(0, 0, 20);

  scene.add(new THREE.AmbientLight(0x334455, 1.0));
  const dir = new THREE.DirectionalLight(0xffffff, 0.7);
  dir.position.set(4, 6, 10);
  scene.add(dir);

  const accentLight = new THREE.PointLight(0x4488ff, 0.7, 14);
  scene.add(accentLight);
  let accentAngle = 0;

  const flashLight = new THREE.PointLight(0xffffff, 0, 12);
  scene.add(flashLight);
  let flashIntensity = 0;

  const cellGeo     = new THREE.BoxGeometry(0.92, 0.92, 0.08);
  const towerGeo    = new THREE.BoxGeometry(0.65, 0.65, 0.55);
  const enemyGeo    = new THREE.SphereGeometry(0.30, 8, 6);
  const projGeo     = new THREE.SphereGeometry(0.10, 6, 4);
  const hpBgGeo     = new THREE.BoxGeometry(0.76, 0.07, 0.07);
  const hpFgGeo     = new THREE.BoxGeometry(0.76, 0.07, 0.07);
  const particleGeo = new THREE.SphereGeometry(0.08, 6, 4);

  const particles: Particle[] = [];

  function spawnParticles(count: number, x: number, y: number, color: number) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(particleGeo, mat);
      mesh.position.set(x, y, 0.7);
      scene.add(mesh);
      const theta = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4;
      particles.push({
        mesh,
        vx: Math.cos(theta) * speed,
        vy: Math.sin(theta) * speed,
        life: 1,
        maxLife: 0.3 + Math.random() * 0.35,
      });
    }
  }

  function updateParticles(dt: number) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt / p.maxLife;
      if (p.life <= 0) {
        scene.remove(p.mesh);
        (p.mesh.material as THREE.MeshBasicMaterial).dispose();
        particles.splice(i, 1);
        continue;
      }
      const friction = Math.exp(-3 * dt);
      p.vx *= friction;
      p.vy *= friction;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.min(1, p.life * 2);
      p.mesh.scale.setScalar(0.3 + p.life * 0.7);
    }
  }

  function cleanParticles() {
    for (const p of particles) {
      scene.remove(p.mesh);
      (p.mesh.material as THREE.MeshBasicMaterial).dispose();
    }
    particles.length = 0;
  }

  let shakeAmt = 0;

  function triggerShake(amt: number) {
    shakeAmt = Math.max(shakeAmt, amt);
  }

  function triggerFlash(intensity: number, x: number, y: number, color: number) {
    flashIntensity = Math.max(flashIntensity, intensity);
    flashLight.color.setHex(color);
    flashLight.position.set(x, y, 2);
  }

  let mapData = generateMap();
  let { grid, path } = mapData;

  let wave = 0;
  let phase: Phase = 'prep';
  let prepTimer = PREP_TIME;
  let gold = INITIAL_GOLD;
  let lives = INITIAL_LIVES;
  let score = 0;
  let isGameOver = false;
  let enemiesToSpawn = 0;
  let spawnTimer = 0;
  let nextId = 0;

  const towers: Tower[] = [];
  let enemies: Enemy[] = [];
  let projectiles: Projectile[] = [];
  const cellMeshes: THREE.Mesh[][] = [];

  function buildGrid() {
    for (let r = 0; r < ROWS; r++) {
      cellMeshes[r] = [];
      for (let c = 0; c < COLS; c++) {
        const kind = grid[r][c];
        const mat = new THREE.MeshStandardMaterial({
          color: CELL_COLORS[kind],
          emissive: kind === 'start' ? 0x001800 : kind === 'end' ? 0x180000 : 0x000000,
          roughness: 0.85,
          metalness: 0.1,
        });
        const mesh = new THREE.Mesh(cellGeo, mat);
        const [wx, wy] = cellWorld(c, r);
        mesh.position.set(wx, wy, -0.04);
        scene.add(mesh);
        cellMeshes[r][c] = mesh;
      }
    }
  }

  function clearGrid() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const m = cellMeshes[r]?.[c];
        if (m) { scene.remove(m); (m.material as THREE.Material).dispose(); }
      }
    }
  }

  buildGrid();

  function getEnemyPos(enemy: Enemy): THREE.Vector3 {
    const pi = Math.min(enemy.pathIdx, path.length - 1);
    const prev = path[Math.max(0, pi - 1)];
    const next = path[pi];
    const [px, py] = cellWorld(prev[0], prev[1]);
    const [nx, ny] = cellWorld(next[0], next[1]);
    return new THREE.Vector3(
      px + (nx - px) * enemy.progress,
      py + (ny - py) * enemy.progress,
      0.35,
    );
  }

  function enemyStats(w: number) {
    return {
      hp:    Math.round(80 * Math.pow(1.15, w - 1)),
      armor: Math.min(0.60, (w - 1) * 0.0025),
      speed: 1.5 + (w - 1) * 0.08,
    };
  }

  function spawnEnemy(w: number) {
    const s = enemyStats(w);
    const [wx, wy] = cellWorld(path[0][0], path[0][1]);
    const baseEmissive = w >= 5 ? 0x441100 : 0x330011;
    const mat = new THREE.MeshStandardMaterial({
      color: w >= 5 ? 0xff5500 : 0xff2233,
      emissive: baseEmissive,
      roughness: 0.4,
      metalness: 0.3,
    });
    const mesh = new THREE.Mesh(enemyGeo, mat);
    mesh.position.set(wx, wy, 0.35);
    scene.add(mesh);
    const hpBg = new THREE.Mesh(hpBgGeo, new THREE.MeshBasicMaterial({ color: 0x660000 }));
    const hpFg = new THREE.Mesh(hpFgGeo, new THREE.MeshBasicMaterial({ color: 0x00cc44 }));
    scene.add(hpBg);
    scene.add(hpFg);
    enemies.push({ id: nextId++, pathIdx: 1, progress: 0, hp: s.hp, maxHp: s.hp, armor: s.armor, speed: s.speed, baseEmissive, flashTimer: 0, mesh, hpBg, hpFg });
  }

  function removeEnemy(e: Enemy) {
    scene.remove(e.mesh, e.hpBg, e.hpFg);
    (e.mesh.material as THREE.Material).dispose();
    (e.hpBg.material as THREE.Material).dispose();
    (e.hpFg.material as THREE.Material).dispose();
  }

  function removeProj(p: Projectile) {
    scene.remove(p.mesh);
    (p.mesh.material as THREE.Material).dispose();
  }

  function applyDamage(targetId: number, damage: number, splash: number) {
    const target = splash > 0 ? enemies.find((e) => e.id === targetId) : null;
    for (const e of enemies) {
      const hit = target
        ? Math.hypot(getEnemyPos(target).x - getEnemyPos(e).x, getEnemyPos(target).y - getEnemyPos(e).y) <= splash
        : e.id === targetId;
      if (hit) {
        e.hp -= Math.max(1, Math.round(damage * (1 - e.armor)));
        e.flashTimer = 0.12;
      }
    }
  }

  function fireAt(tower: Tower, target: Enemy) {
    const stats = TOWER_DEFS[tower.type];
    const scaledDamage = stats.damage * Math.pow(1.01, Math.max(0, wave - 1));
    const [tx, ty] = cellWorld(tower.col, tower.row);
    const color = tower.type === 'sniper' ? 0xcc88ff : tower.type === 'splash' ? 0xffaa00 : 0xffff44;
    const mesh = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({ color }));
    mesh.position.set(tx, ty, 0.4);
    scene.add(mesh);
    projectiles.push({ mesh, targetId: target.id, damage: scaledDamage, splash: stats.splash });
  }

  function startWave() {
    wave++;
    cb.onWave(wave);
    enemiesToSpawn = 4 + wave * 2;
    spawnTimer = 0;
    phase = 'wave';
    cb.onPhase('wave');
    const [sx, sy] = cellWorld(path[0][0], path[0][1]);
    triggerShake(0.15);
    triggerFlash(4, sx, sy, 0x4488ff);
  }

  const updateSize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const ga = COLS / ROWS;
    const pad = 0.4;
    if (aspect > ga) {
      camera.top = ROWS / 2 + pad;
      camera.bottom = -(ROWS / 2 + pad);
      camera.left = -(ROWS / 2 + pad) * aspect;
      camera.right = (ROWS / 2 + pad) * aspect;
    } else {
      camera.left = -(COLS / 2 + pad);
      camera.right = COLS / 2 + pad;
      camera.top = (COLS / 2 + pad) / aspect;
      camera.bottom = -(COLS / 2 + pad) / aspect;
    }
    camera.updateProjectionMatrix();
  };

  const resizeObs = new ResizeObserver(updateSize);
  resizeObs.observe(canvas);
  updateSize();

  let rafId = 0;
  let lastTime = performance.now();

  const tick = () => {
    rafId = requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (isGameOver) { renderer.render(scene, camera); return; }

    // Accent orbit (XY plane for top-down view)
    accentAngle += dt * 0.5;
    accentLight.position.set(Math.cos(accentAngle) * 6, Math.sin(accentAngle) * 3.5, 3);

    // Flash decay
    flashIntensity *= Math.exp(-10 * dt);
    flashLight.intensity = flashIntensity;

    // Screen shake (camera translates in XY, keeps top-down angle)
    shakeAmt *= Math.exp(-6 * dt);
    if (shakeAmt > 0.002) {
      camera.position.set(
        (Math.random() - 0.5) * shakeAmt * 0.8,
        (Math.random() - 0.5) * shakeAmt * 0.8,
        20,
      );
    } else {
      camera.position.set(0, 0, 20);
    }

    // Tower spawn-pop animation
    for (const t of towers) {
      if (t.spawnAnim < 1) {
        t.spawnAnim = Math.min(1, t.spawnAnim + dt / 0.2);
        const s = t.spawnAnim < 0.6
          ? t.spawnAnim / 0.6
          : 1 + 0.35 * Math.sin(((t.spawnAnim - 0.6) / 0.4) * Math.PI);
        t.mesh.scale.setScalar(s);
      }
    }

    updateParticles(dt);

    if (phase === 'prep') {
      prepTimer -= dt;
      cb.onPrepTimer(Math.max(0, prepTimer));
      if (prepTimer <= 0) startWave();
    } else {
      // Spawn
      if (enemiesToSpawn > 0) {
        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          spawnEnemy(wave);
          enemiesToSpawn--;
          spawnTimer = SPAWN_INTERVAL;
        }
      }

      // Move enemies
      const escaped: Enemy[] = [];
      for (const e of enemies) {
        e.progress += e.speed * dt;
        let done = false;
        while (e.progress >= 1.0) {
          e.progress -= 1.0;
          e.pathIdx++;
          if (e.pathIdx >= path.length) { escaped.push(e); done = true; break; }
        }
        if (done) continue;

        const ep = getEnemyPos(e);
        e.mesh.position.copy(ep);
        const frac = Math.max(0, e.hp / e.maxHp);
        e.hpBg.position.set(ep.x, ep.y + 0.55, 0.55);
        e.hpFg.scale.x = frac;
        e.hpFg.position.set(ep.x - 0.38 * (1 - frac), ep.y + 0.55, 0.58);
        const mat = e.mesh.material as THREE.MeshStandardMaterial;
        mat.emissive.setHex(e.flashTimer > 0 ? 0x888888 : e.baseEmissive);
        e.flashTimer = Math.max(0, e.flashTimer - dt);
      }

      // Handle escaped
      for (const e of escaped) {
        const ep = getEnemyPos(e);
        spawnParticles(15, ep.x, ep.y, 0xff2233);
        triggerFlash(5, ep.x, ep.y, 0xff2200);
        triggerShake(0.3);
        removeEnemy(e);
        enemies = enemies.filter((x) => x.id !== e.id);
        lives = Math.max(0, lives - 1);
        cb.onLives(lives);
        if (lives <= 0) {
          triggerShake(0.6);
          isGameOver = true;
          cb.onGameOver();
          renderer.render(scene, camera);
          return;
        }
      }

      // Towers fire
      for (const tower of towers) {
        tower.cooldown -= dt;
        if (tower.cooldown > 0) continue;
        const stats = TOWER_DEFS[tower.type];
        const [tx, ty] = cellWorld(tower.col, tower.row);
        let best: Enemy | null = null;
        let bestProg = -1;
        for (const e of enemies) {
          const ep = getEnemyPos(e);
          if (Math.hypot(ep.x - tx, ep.y - ty) > stats.range) continue;
          const tp = e.pathIdx + e.progress;
          if (tp > bestProg) { bestProg = tp; best = e; }
        }
        if (best) { fireAt(tower, best); tower.cooldown = 1 / stats.fireRate; }
      }

      // Move projectiles
      const hitProjs: Projectile[] = [];
      for (const p of projectiles) {
        const tgt = enemies.find((e) => e.id === p.targetId);
        if (!tgt) { hitProjs.push(p); continue; }
        const tp = getEnemyPos(tgt);
        const dx = tp.x - p.mesh.position.x;
        const dy = tp.y - p.mesh.position.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.22) {
          applyDamage(p.targetId, p.damage, p.splash);
          hitProjs.push(p);
        } else {
          const s = PROJ_SPEED * dt / dist;
          p.mesh.position.x += dx * s;
          p.mesh.position.y += dy * s;
        }
      }
      for (const p of hitProjs) { removeProj(p); }
      projectiles = projectiles.filter((p) => !hitProjs.includes(p));

      // Kill dead enemies
      const dead = enemies.filter((e) => e.hp <= 0);
      for (const e of dead) {
        const ep = getEnemyPos(e);
        const enemyColor = wave >= 5 ? 0xff5500 : 0xff2233;
        spawnParticles(20, ep.x, ep.y, enemyColor);
        triggerFlash(8, ep.x, ep.y, enemyColor);
        triggerShake(0.08);
        removeEnemy(e);
        const orphans = projectiles.filter((p) => p.targetId === e.id);
        orphans.forEach(removeProj);
        projectiles = projectiles.filter((p) => p.targetId !== e.id);
        score++;
        gold += 8 + wave * 2;
        cb.onScore(score);
        cb.onGold(gold);
      }
      enemies = enemies.filter((e) => e.hp > 0);

      // Wave complete
      if (enemiesToSpawn === 0 && enemies.length === 0) {
        gold += 15 + wave * 5;
        cb.onGold(gold);
        phase = 'prep';
        prepTimer = PREP_TIME;
        cb.onPhase('prep');
      }
    }

    renderer.render(scene, camera);
  };

  tick();

  cb.onGold(gold);
  cb.onLives(lives);
  cb.onWave(wave);
  cb.onScore(score);
  cb.onPhase('prep');
  cb.onPrepTimer(prepTimer);

  function canvasToCell(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const halfW = (camera.right - camera.left) / 2;
    const halfH = (camera.top - camera.bottom) / 2;
    const worldX = ndcX * halfW + (camera.right + camera.left) / 2;
    const worldY = ndcY * halfH + (camera.top + camera.bottom) / 2;
    const col = Math.floor(worldX + COLS / 2);
    const row = Math.floor(ROWS / 2 - worldY);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
    return { col, row };
  }

  function placeTower(col: number, row: number, type: TowerType): boolean {
    if (isGameOver) return false;
    if (grid[row][col] !== 'empty') return false;
    if (towers.some((t) => t.col === col && t.row === row)) return false;
    const cost = TOWER_DEFS[type].cost;
    if (gold < cost) return false;
    gold -= cost;
    cb.onGold(gold);
    const stats = TOWER_DEFS[type];
    const [wx, wy] = cellWorld(col, row);
    const mat = new THREE.MeshStandardMaterial({
      color: stats.color,
      emissive: stats.emissive,
      roughness: 0.3,
      metalness: 0.6,
    });
    const mesh = new THREE.Mesh(towerGeo, mat);
    mesh.position.set(wx, wy, 0.35);
    mesh.scale.setScalar(0);
    scene.add(mesh);
    towers.push({ col, row, type, mesh, cooldown: 0, spawnAnim: 0 });
    spawnParticles(10, wx, wy, stats.color);
    triggerShake(0.04);
    triggerFlash(3, wx, wy, stats.color);
    return true;
  }

  function sellTower(col: number, row: number): number {
    if (isGameOver) return 0;
    const idx = towers.findIndex((t) => t.col === col && t.row === row);
    if (idx < 0) return 0;
    const [t] = towers.splice(idx, 1);
    const refund = Math.floor(TOWER_DEFS[t.type].cost * 0.5);
    scene.remove(t.mesh);
    (t.mesh.material as THREE.Material).dispose();
    const [wx, wy] = cellWorld(t.col, t.row);
    gold += refund;
    cb.onGold(gold);
    spawnParticles(12, wx, wy, 0xffd700);
    triggerShake(0.03);
    triggerFlash(4, wx, wy, 0xffd700);
    return refund;
  }

  function clearAll() {
    enemies.forEach(removeEnemy);
    enemies = [];
    projectiles.forEach(removeProj);
    projectiles = [];
    towers.forEach((t) => { scene.remove(t.mesh); (t.mesh.material as THREE.Material).dispose(); });
    towers.length = 0;
    cleanParticles();
  }

  return {
    canvasToCell,
    placeTower,
    sellTower,
    restart() {
      clearAll();
      clearGrid();
      mapData = generateMap();
      grid = mapData.grid;
      path = mapData.path;
      buildGrid();
      wave = 0; phase = 'prep'; prepTimer = PREP_TIME;
      gold = INITIAL_GOLD; lives = INITIAL_LIVES; score = 0;
      isGameOver = false; enemiesToSpawn = 0; spawnTimer = 0; nextId = 0;
      shakeAmt = 0; flashIntensity = 0; flashLight.intensity = 0;
      cb.onGold(gold); cb.onLives(lives); cb.onWave(wave);
      cb.onScore(score); cb.onPhase('prep'); cb.onPrepTimer(prepTimer);
    },
    destroy() {
      cancelAnimationFrame(rafId);
      resizeObs.disconnect();
      clearAll();
      clearGrid();
      cellGeo.dispose(); towerGeo.dispose(); enemyGeo.dispose();
      projGeo.dispose(); hpBgGeo.dispose(); hpFgGeo.dispose(); particleGeo.dispose();
      renderer.dispose();
    },
  };
}
