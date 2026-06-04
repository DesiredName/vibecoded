import * as THREE from 'three';

const AREA_W = 14;
const AREA_H = 20;
const PADDLE_W_BASE = 3.2;
const PADDLE_W_WIDE = 5.5;
const PADDLE_D = 0.6;
const BALL_R = 0.35;
const BRICK_W = 1.4;
const BRICK_D = 0.55;
const BRICK_COLS = 8;
const BRICK_ROWS = 6;
const BRICK_GAP_X = 0.15;
const BRICK_GAP_Z = 0.32;
const BALL_SPEED = 9;
const PADDLE_Z = AREA_H / 2 - 1;
const TRAIL_LEN = 7;
const COMBO_WINDOW = 2.5;

type GameState = 'waiting' | 'playing' | 'dead' | 'won';
type BrickKind = 'normal' | 'hard' | 'explosive';
type PowerKind = 'wide' | 'multi' | 'fireball';

export type Callbacks = {
  onScore: (s: number,) => void;
  onLives: (l: number,) => void;
  onGameOver: () => void;
  onWin: () => void;
  onCombo?: (combo: number,) => void;
  onPowerUp?: (label: string,) => void;
};

type Brick = {
  x: number;
  z: number;
  mesh: THREE.Mesh;
  alive: boolean;
  hp: number;
  maxHp: number;
  kind: BrickKind;
  color: number;
  col: number;
  row: number;
};

type Ball = {
  x: number;
  z: number;
  vx: number;
  vz: number;
  mesh: THREE.Mesh;
  glow: THREE.PointLight;
  trail: THREE.Mesh[];
  trailPos: Array<{ x: number; z: number }>;
};

type PowerDrop = {
  kind: PowerKind;
  x: number;
  z: number;
  mesh: THREE.Mesh;
  glow: THREE.PointLight;
};

type Particle = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
};

function clamp(v: number, lo: number, hi: number,) {
  return Math.max(lo, Math.min(hi, v,),);
}

function darkenHex(color: number, f: number,): number {
  const r = Math.round(((color >> 16) & 0xff) * f,);
  const g = Math.round(((color >> 8) & 0xff) * f,);
  const b = Math.round((color & 0xff) * f,);
  return (r << 16) | (g << 8) | b;
}

export function createBreakoutGame(canvas: HTMLCanvasElement, cb: Callbacks,) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, },);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2,),);
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080f,);
  scene.fog = new THREE.FogExp2(0x07080f, 0.022,);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200,);
  const camBase = new THREE.Vector3(0, 22, 9,);
  camera.position.copy(camBase,);
  camera.lookAt(0, 0, 0,);

  scene.add(new THREE.AmbientLight(0x334466, 2,),);
  const sun = new THREE.DirectionalLight(0xffffff, 2.5,);
  sun.position.set(5, 15, 8,);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024,);
  scene.add(sun,);

  const accentLight = new THREE.PointLight(0x4488ff, 3, 24,);
  accentLight.position.set(0, 5, 0,);
  scene.add(accentLight,);

  const flashLight = new THREE.PointLight(0xffffff, 0, 14,);
  scene.add(flashLight,);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(AREA_W, AREA_H,),
    new THREE.MeshStandardMaterial({ color: 0x0d1120, roughness: 0.95, },),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor,);

  const grid = new THREE.GridHelper(Math.max(AREA_W, AREA_H,), 20, 0x1a2840, 0x111828,);
  grid.position.y = 0.01;
  scene.add(grid,);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a2840, roughness: 0.8, emissive: 0x0a1428, emissiveIntensity: 0.3, },);
  const wallThick = 0.5;
  const wallH = 0.5;
  const leftW = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallH, AREA_H + wallThick * 2,), wallMat,);
  leftW.position.set(-(AREA_W / 2 + wallThick / 2), wallH / 2, 0,);
  scene.add(leftW,);
  const rightW = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallH, AREA_H + wallThick * 2,), wallMat,);
  rightW.position.set(AREA_W / 2 + wallThick / 2, wallH / 2, 0,);
  scene.add(rightW,);
  const topW = new THREE.Mesh(new THREE.BoxGeometry(AREA_W + wallThick * 2, wallH, wallThick,), wallMat,);
  topW.position.set(0, wallH / 2, -(AREA_H / 2 + wallThick / 2),);
  scene.add(topW,);

  // Paddle
  const paddleMat = new THREE.MeshStandardMaterial({ color: 0x4499ff, emissive: 0x2255cc, emissiveIntensity: 0.45, roughness: 0.2, metalness: 0.3, },);
  const paddleMesh = new THREE.Mesh(new THREE.BoxGeometry(PADDLE_W_BASE, 0.3, PADDLE_D,), paddleMat,);
  paddleMesh.position.set(0, 0.15, PADDLE_Z,);
  paddleMesh.castShadow = true;
  scene.add(paddleMesh,);
  const paddleGlow = new THREE.PointLight(0x4499ff, 4, 6,);
  paddleGlow.position.set(0, 0.5, PADDLE_Z,);
  scene.add(paddleGlow,);

  // === Particle System ===
  const particles: Particle[] = [];
  const particleGeo = new THREE.SphereGeometry(0.1, 4, 3,);

  function spawnParticles(x: number, z: number, count: number, color: number,) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, },);
      const mesh = new THREE.Mesh(particleGeo, mat,);
      mesh.position.set(x, 0.2, z,);
      scene.add(mesh,);
      const theta = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 7;
      particles.push({
        mesh,
        vel: new THREE.Vector3(
          Math.cos(theta,) * speed,
          2 + Math.random() * 5,
          Math.sin(theta,) * speed * 0.4,
        ),
        life: 1,
        maxLife: 0.3 + Math.random() * 0.4,
      },);
    }
  }

  function updateParticles(dt: number,) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!;
      p.life -= dt / p.maxLife;
      if (p.life <= 0) {
        scene.remove(p.mesh,);
        (p.mesh.material as THREE.MeshBasicMaterial).dispose();
        particles.splice(i, 1,);
        continue;
      }
      p.vel.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.vel, dt,);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, p.life * 2,);
      p.mesh.scale.setScalar(0.3 + p.life * 0.7,);
    }
  }

  function cleanParticles() {
    for (const p of particles) {
      scene.remove(p.mesh,);
      (p.mesh.material as THREE.MeshBasicMaterial).dispose();
    }
    particles.length = 0;
  }

  // === Screen Shake / Flash ===
  let shakeAmt = 0;
  let flashIntensity = 0;

  function triggerShake(amount: number,) { shakeAmt = Math.max(shakeAmt, amount,); }

  function triggerFlash(x: number, z: number, color: number, intensity: number,) {
    flashLight.position.set(x, 1, z,);
    flashLight.color.set(color,);
    flashIntensity = Math.max(flashIntensity, intensity,);
  }

  // === Ball System ===
  const ballGeo = new THREE.SphereGeometry(BALL_R, 16, 12,);
  const trailGeo = new THREE.SphereGeometry(BALL_R * 0.75, 8, 6,);
  const balls: Ball[] = [];

  function createBall(x: number, z: number, vx: number, vz: number,): Ball {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xaaddff, emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.2, },);
    const mesh = new THREE.Mesh(ballGeo, mat,);
    mesh.castShadow = true;
    mesh.position.set(x, BALL_R + 0.05, z,);
    scene.add(mesh,);
    const glow = new THREE.PointLight(0xaaddff, 5, 3,);
    scene.add(glow,);
    const trail: THREE.Mesh[] = [];
    for (let i = 0; i < TRAIL_LEN; i++) {
      const tMat = new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0, },);
      const tMesh = new THREE.Mesh(trailGeo, tMat,);
      scene.add(tMesh,);
      trail.push(tMesh,);
    }
    return {
      x, z, vx, vz, mesh, glow, trail,
      trailPos: Array.from({ length: TRAIL_LEN, }, () => ({ x, z, }),),
    };
  }

  function destroyBall(ball: Ball,) {
    scene.remove(ball.mesh,);
    (ball.mesh.material as THREE.MeshStandardMaterial).dispose();
    scene.remove(ball.glow,);
    for (const t of ball.trail) {
      scene.remove(t,);
      (t.material as THREE.MeshBasicMaterial).dispose();
    }
  }

  // === Brick System ===
  const BRICK_COLORS = [0xff2255, 0xff6600, 0xffcc00, 0x00cc66, 0x4488ff, 0xaa44ff,];
  const bricks: Brick[] = [];
  const totalBrickW = BRICK_COLS * BRICK_W + (BRICK_COLS - 1) * BRICK_GAP_X;
  const brickStartX = -totalBrickW / 2 + BRICK_W / 2;
  const brickStartZ = -AREA_H / 2 + 2;

  function makeBrickMat(color: number, kind: BrickKind, hp: number, maxHp: number,) {
    const cracked = hp < maxHp;
    return new THREE.MeshStandardMaterial({
      color: cracked ? darkenHex(color, 0.45,) : color,
      emissive: kind === 'explosive' ? 0xff5500 : color,
      emissiveIntensity: kind === 'explosive' ? 0.8 : cracked ? 0.05 : 0.25,
      roughness: cracked ? 0.95 : 0.3,
      metalness: 0.1,
    },);
  }

  function buildBricks() {
    for (let row = 0; row < BRICK_ROWS; row++) {
      const color = BRICK_COLORS[row % BRICK_COLORS.length]!;
      for (let col = 0; col < BRICK_COLS; col++) {
        const kind: BrickKind = row < 2 ? 'hard' : Math.random() < 0.1 ? 'explosive' : 'normal';
        const maxHp = kind === 'hard' ? 2 : 1;
        const mat = makeBrickMat(color, kind, maxHp, maxHp,);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(BRICK_W, 0.3, BRICK_D,), mat,);
        const x = brickStartX + col * (BRICK_W + BRICK_GAP_X);
        const z = brickStartZ + row * (BRICK_D + BRICK_GAP_Z);
        mesh.position.set(x, 0.15, z,);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh,);
        bricks.push({ x, z, mesh, alive: true, hp: maxHp, maxHp, kind, color, col, row, },);
      }
    }
  }

  buildBricks();

  // === Power Drops ===
  const POWER_COLORS = { wide: 0x4499ff, multi: 0x00ff88, fireball: 0xff4400, } as const;
  const POWER_LABELS = { wide: 'WIDE PADDLE', multi: 'MULTI-BALL', fireball: 'FIREBALL', } as const;
  const POWER_KINDS: PowerKind[] = ['wide', 'multi', 'fireball',];
  const powerDrops: PowerDrop[] = [];
  let wideUntil = 0;
  let fireUntil = 0;

  function spawnPowerDrop(x: number, z: number,) {
    if (Math.random() > 0.25) return;
    const kind = POWER_KINDS[Math.floor(Math.random() * POWER_KINDS.length,)]!;
    const color = POWER_COLORS[kind];
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.35, 0,),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.2, },),
    );
    mesh.position.set(x, 0.4, z,);
    scene.add(mesh,);
    const glow = new THREE.PointLight(color, 3, 3,);
    glow.position.set(x, 0.6, z,);
    scene.add(glow,);
    powerDrops.push({ kind, x, z, mesh, glow, },);
  }

  // === Combo ===
  let combo = 0;
  let comboTimer = 0;

  function comboMult() {
    if (combo >= 8) return 5;
    if (combo >= 5) return 3;
    if (combo >= 3) return 2;
    return 1;
  }

  // === Game State ===
  let paddleX = 0;
  let targetX = 0;
  let score = 0;
  let lives = 3;
  let gameState: GameState = 'waiting';
  let animId = 0;
  let lastTime = 0;
  let tick = 0;
  const keys: Record<string, boolean> = {};

  function launch() {
    if (gameState !== 'waiting' || balls.length === 0) return;
    const angle = -Math.PI / 2 + (Math.random() * 0.6 - 0.3);
    balls[0]!.vx = Math.cos(angle,) * BALL_SPEED;
    balls[0]!.vz = Math.sin(angle,) * BALL_SPEED;
    gameState = 'playing';
  }

  function resetBall() {
    for (const b of balls) destroyBall(b,);
    balls.length = 0;
    balls.push(createBall(paddleX, PADDLE_Z - 0.8, 0, 0,),);
    gameState = 'waiting';
  }

  resetBall();

  // === Brick Break (with explosive chaining) ===
  function breakBrick(brick: Brick, fromChain = false,) {
    if (!brick.alive) return;
    brick.hp--;

    if (brick.hp > 0) {
      // Cracked — update visual only
      (brick.mesh.material as THREE.MeshStandardMaterial).dispose();
      brick.mesh.material = makeBrickMat(brick.color, brick.kind, brick.hp, brick.maxHp,);
      spawnParticles(brick.x, brick.z, 10, brick.color,);
      triggerFlash(brick.x, brick.z, brick.color, 3,);
      triggerShake(0.05,);
      return;
    }

    brick.alive = false;
    scene.remove(brick.mesh,);

    const pts = 10 * comboMult() * (brick.kind === 'hard' ? 2 : brick.kind === 'explosive' ? 3 : 1);
    score += pts;
    cb.onScore(score,);

    const boom = brick.kind === 'explosive';
    spawnParticles(brick.x, brick.z, boom ? 60 : 25, brick.color,);
    triggerFlash(brick.x, brick.z, brick.color, boom ? 15 : 6,);
    triggerShake(boom ? 0.25 : 0.08,);

    // Power drops only from the ball's direct hit, not chain kills
    if (!fromChain) spawnPowerDrop(brick.x, brick.z,);

    // Explosive chain reaction to 8 neighbors
    if (boom) {
      for (const other of bricks) {
        if (other.alive && Math.abs(other.col - brick.col,) <= 1 && Math.abs(other.row - brick.row,) <= 1 && other !== brick) {
          breakBrick(other, true,);
        }
      }
    }

    if (gameState === 'playing' && bricks.every((b,) => !b.alive,)) {
      gameState = 'won';
      cb.onWin();
    }
  }

  // === Input ===
  function onMouseMove(e: MouseEvent,) {
    const rect = canvas.getBoundingClientRect();
    targetX = ((e.clientX - rect.left) / rect.width - 0.5) * AREA_W * 0.95;
  }
  function onMouseClick() { launch(); }
  function onTouchStart(e: TouchEvent,) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    targetX = ((e.touches[0]!.clientX - rect.left) / rect.width - 0.5) * AREA_W * 0.95;
    launch();
  }
  function onTouchMove(e: TouchEvent,) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    targetX = ((e.touches[0]!.clientX - rect.left) / rect.width - 0.5) * AREA_W * 0.95;
  }
  function onKeyDown(e: KeyboardEvent,) {
    keys[e.key] = true;
    if (e.key === ' ' || e.key === 'Enter') launch();
  }
  function onKeyUp(e: KeyboardEvent,) { keys[e.key] = false; }

  canvas.addEventListener('mousemove', onMouseMove,);
  canvas.addEventListener('click', onMouseClick,);
  canvas.addEventListener('touchstart', onTouchStart, { passive: false, },);
  canvas.addEventListener('touchmove', onTouchMove, { passive: false, },);
  window.addEventListener('keydown', onKeyDown,);
  window.addEventListener('keyup', onKeyUp,);

  // === Update ===
  function update(dt: number,) {
    const now = performance.now();
    const isFireball = now < fireUntil;
    const isWide = now < wideUntil;
    const pW = isWide ? PADDLE_W_WIDE : PADDLE_W_BASE;
    const pLimit = AREA_W / 2 - pW / 2;

    // Paddle color reacts to active power
    if (isFireball) {
      paddleMat.emissive.set(0xff2200,);
      paddleMat.emissiveIntensity = 0.9;
      paddleGlow.color.set(0xff4400,);
    } else if (isWide) {
      paddleMat.emissive.set(0x2299ff,);
      paddleMat.emissiveIntensity = 0.7;
      paddleGlow.color.set(0x44aaff,);
    } else {
      paddleMat.emissive.set(0x2255cc,);
      paddleMat.emissiveIntensity = 0.45;
      paddleGlow.color.set(0x4499ff,);
    }
    paddleMesh.scale.x = pW / PADDLE_W_BASE;

    // Keyboard input
    const keySpeed = 12;
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) targetX -= keySpeed * dt;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) targetX += keySpeed * dt;
    targetX = clamp(targetX, -pLimit, pLimit,);
    paddleX += (targetX - paddleX) * Math.min(1, dt * 16,);
    paddleX = clamp(paddleX, -pLimit, pLimit,);
    paddleMesh.position.x = paddleX;
    paddleGlow.position.x = paddleX;

    // Combo decay
    if (combo > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) { combo = 0; cb.onCombo?.(0,); }
    }

    // Power drops fall toward paddle
    for (let i = powerDrops.length - 1; i >= 0; i--) {
      const p = powerDrops[i]!;
      p.z += 9 * dt;
      p.mesh.position.z = p.z;
      p.glow.position.z = p.z;
      p.mesh.rotation.y += 3 * dt;
      p.mesh.rotation.x += 1.5 * dt;

      if (p.z > AREA_H / 2 + 2) {
        scene.remove(p.mesh,);
        scene.remove(p.glow,);
        powerDrops.splice(i, 1,);
        continue;
      }

      // Paddle catch
      if (Math.abs(p.x - paddleX,) < pW / 2 + 0.4 && Math.abs(p.z - PADDLE_Z,) < 0.7) {
        const kind = p.kind;
        spawnParticles(p.x, p.z, 20, POWER_COLORS[kind],);
        triggerFlash(p.x, p.z, POWER_COLORS[kind], 10,);
        triggerShake(0.12,);
        if (kind === 'wide') {
          wideUntil = now + 8000;
          cb.onPowerUp?.(POWER_LABELS.wide,);
        } else if (kind === 'fireball') {
          fireUntil = now + 5000;
          cb.onPowerUp?.(POWER_LABELS.fireball,);
        } else {
          // Spawn 2 extra balls from first ball's position with spread
          const src = balls[0];
          if (src) {
            for (let j = 0; j < 2; j++) {
              const a = Math.atan2(src.vz, src.vx,) + (j === 0 ? 0.5 : -0.5);
              balls.push(createBall(src.x, src.z, Math.cos(a,) * BALL_SPEED, Math.sin(a,) * BALL_SPEED,),);
            }
          }
          cb.onPowerUp?.(POWER_LABELS.multi,);
        }
        scene.remove(p.mesh,);
        scene.remove(p.glow,);
        powerDrops.splice(i, 1,);
      }
    }

    // Waiting: ball rides paddle
    if (gameState === 'waiting') {
      if (balls.length > 0) {
        const b = balls[0]!;
        b.x = paddleX;
        b.z = PADDLE_Z - 0.8;
        b.mesh.position.set(b.x, BALL_R + 0.05, b.z,);
        b.glow.position.set(b.x, BALL_R + 0.5, b.z,);
      }
      return;
    }
    if (gameState !== 'playing') return;

    const bHalfW = BRICK_W / 2;
    const bHalfD = BRICK_D / 2;

    for (let bi = balls.length - 1; bi >= 0; bi--) {
      const ball = balls[bi]!;

      // Capture position before move (for trail)
      const prevX = ball.x;
      const prevZ = ball.z;

      ball.x += ball.vx * dt;
      ball.z += ball.vz * dt;

      // Side walls
      if (ball.x - BALL_R < -AREA_W / 2) { ball.x = -AREA_W / 2 + BALL_R; ball.vx = Math.abs(ball.vx,); triggerShake(0.02,); }
      if (ball.x + BALL_R > AREA_W / 2) { ball.x = AREA_W / 2 - BALL_R; ball.vx = -Math.abs(ball.vx,); triggerShake(0.02,); }
      // Top wall
      if (ball.z - BALL_R < -AREA_H / 2) { ball.z = -AREA_H / 2 + BALL_R; ball.vz = Math.abs(ball.vz,); triggerShake(0.02,); }

      // Ball lost
      if (ball.z > AREA_H / 2 + 2) {
        spawnParticles(ball.x, AREA_H / 2, 15, 0xff3333,);
        destroyBall(ball,);
        balls.splice(bi, 1,);
        if (balls.length === 0) {
          combo = 0;
          cb.onCombo?.(0,);
          lives--;
          cb.onLives(lives,);
          if (lives <= 0) {
            gameState = 'dead';
            triggerShake(0.5,);
            cb.onGameOver();
          } else {
            triggerShake(0.3,);
            resetBall();
          }
        }
        continue;
      }

      // Paddle collision
      if (
        ball.vz > 0 &&
        ball.x > paddleX - pW / 2 - BALL_R &&
        ball.x < paddleX + pW / 2 + BALL_R &&
        ball.z > PADDLE_Z - PADDLE_D / 2 - BALL_R &&
        ball.z < PADDLE_Z + PADDLE_D / 2 + BALL_R
      ) {
        ball.z = PADDLE_Z - PADDLE_D / 2 - BALL_R;
        ball.vz = -Math.abs(ball.vz,);
        const rel = clamp((ball.x - paddleX) / (pW / 2), -1, 1,);
        ball.vx = rel * BALL_SPEED * 0.8;
        const spd = Math.sqrt(ball.vx ** 2 + ball.vz ** 2,);
        ball.vx = (ball.vx / spd) * BALL_SPEED;
        ball.vz = (ball.vz / spd) * BALL_SPEED;
        // Paddle hit resets combo streak
        combo = 0;
        cb.onCombo?.(0,);
        triggerShake(0.04,);
        spawnParticles(ball.x, PADDLE_Z, 8, 0x4499ff,);
      }

      // Brick collisions
      for (const brick of bricks) {
        if (!brick.alive) continue;
        const dx = Math.abs(ball.x - brick.x,);
        const dz = Math.abs(ball.z - brick.z,);
        if (dx < bHalfW + BALL_R && dz < bHalfD + BALL_R) {
          if (!isFireball) {
            // Normal bounce — resolve by smallest overlap axis
            const overlapX = bHalfW + BALL_R - dx;
            const overlapZ = bHalfD + BALL_R - dz;
            if (overlapX < overlapZ) ball.vx = -ball.vx;
            else ball.vz = -ball.vz;
          }
          combo++;
          comboTimer = COMBO_WINDOW;
          cb.onCombo?.(combo,);
          breakBrick(brick,);
          // Fireball keeps moving through bricks; normal ball stops at first hit
          if (!isFireball) break;
        }
      }

      // Ball trail — shift positions and update meshes
      for (let i = TRAIL_LEN - 1; i > 0; i--) ball.trailPos[i] = ball.trailPos[i - 1]!;
      ball.trailPos[0] = { x: prevX, z: prevZ, };
      for (let i = 0; i < TRAIL_LEN; i++) {
        const frac = (TRAIL_LEN - 1 - i) / TRAIL_LEN;
        const t = ball.trail[i]!;
        const pos = ball.trailPos[i]!;
        t.position.set(pos.x, BALL_R + 0.05, pos.z,);
        const tMat = t.material as THREE.MeshBasicMaterial;
        tMat.color.set(isFireball ? 0xff4400 : 0x88ccff,);
        tMat.opacity = frac * 0.45;
        t.scale.setScalar(0.35 + frac * 0.65,);
      }

      ball.mesh.position.set(ball.x, BALL_R + 0.05, ball.z,);
      ball.glow.position.set(ball.x, BALL_R + 0.5, ball.z,);

      // Ball color / glow reacts to fireball state
      const bMat = ball.mesh.material as THREE.MeshStandardMaterial;
      bMat.emissive.set(isFireball ? 0xff4400 : 0xaaddff,);
      bMat.emissiveIntensity = isFireball ? 1.2 : 0.6;
      ball.glow.color.set(isFireball ? 0xff6600 : 0xaaddff,);
    }
  }

  // === Render Loop ===
  function loop(ts: number,) {
    animId = requestAnimationFrame(loop,);
    const dt = Math.min((ts - lastTime) / 1000, 0.05,);
    lastTime = ts;
    tick += dt;

    update(dt,);
    updateParticles(dt,);

    // Flash light exponential decay
    if (flashIntensity > 0.05) {
      flashIntensity *= Math.exp(-10 * dt,);
      flashLight.intensity = flashIntensity;
    } else if (flashIntensity > 0) {
      flashIntensity = 0;
      flashLight.intensity = 0;
    }

    // Camera shake with exponential decay
    if (shakeAmt > 0.002) {
      shakeAmt *= Math.exp(-6 * dt,);
      camera.position.set(
        camBase.x + (Math.random() - 0.5) * shakeAmt * 2,
        camBase.y + (Math.random() - 0.5) * shakeAmt,
        camBase.z + (Math.random() - 0.5) * shakeAmt * 2,
      );
      camera.lookAt(0, 0, 0,);
    } else if (shakeAmt !== 0) {
      shakeAmt = 0;
      camera.position.copy(camBase,);
      camera.lookAt(0, 0, 0,);
    }

    // Orbiting accent light
    accentLight.position.x = Math.sin(tick * 0.25,) * 6;
    accentLight.position.z = Math.cos(tick * 0.25,) * 6;

    // Ball glow pulse
    for (const ball of balls) {
      ball.glow.intensity = 4 + Math.sin(tick * 5,) * 0.6;
    }

    renderer.render(scene, camera,);
  }

  function resize() {
    const w = canvas.clientWidth || canvas.offsetWidth;
    const h = canvas.clientHeight || canvas.offsetHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false,);
    camera.aspect = w / h;
    camera.zoom = Math.min(1, (w / h) * (AREA_H / AREA_W),);
    camera.updateProjectionMatrix();
  }

  const ro = new ResizeObserver(resize,);
  ro.observe(canvas.parentElement ?? canvas,);
  resize();

  animId = requestAnimationFrame((ts,) => { lastTime = ts; loop(ts,); },);

  return {
    restart() {
      cleanParticles();
      for (const p of powerDrops) { scene.remove(p.mesh,); scene.remove(p.glow,); }
      powerDrops.length = 0;
      for (const b of balls) destroyBall(b,);
      balls.length = 0;
      shakeAmt = 0;
      flashIntensity = 0;
      flashLight.intensity = 0;
      wideUntil = 0;
      fireUntil = 0;
      combo = 0;
      score = 0;
      lives = 3;
      paddleX = 0;
      targetX = 0;
      for (const brick of bricks) {
        brick.hp = brick.maxHp;
        brick.alive = true;
        (brick.mesh.material as THREE.MeshStandardMaterial).dispose();
        brick.mesh.material = makeBrickMat(brick.color, brick.kind, brick.hp, brick.maxHp,);
        scene.add(brick.mesh,);
      }
      cb.onScore(0,);
      cb.onLives(3,);
      cb.onCombo?.(0,);
      resetBall();
    },
    destroy() {
      cancelAnimationFrame(animId,);
      ro.disconnect();
      canvas.removeEventListener('mousemove', onMouseMove,);
      canvas.removeEventListener('click', onMouseClick,);
      canvas.removeEventListener('touchstart', onTouchStart,);
      canvas.removeEventListener('touchmove', onTouchMove,);
      window.removeEventListener('keydown', onKeyDown,);
      window.removeEventListener('keyup', onKeyUp,);
      cleanParticles();
      for (const b of balls) destroyBall(b,);
      renderer.dispose();
    },
  };
}
