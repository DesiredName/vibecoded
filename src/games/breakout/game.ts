import * as THREE from 'three';

const AREA_W = 14;
const AREA_H = 20;
const PADDLE_W = 3.2;
const PADDLE_D = 0.6;
const BALL_R = 0.35;
const BRICK_W = 1.4;
const BRICK_D = 0.55;
const BRICK_COLS = 8;
const BRICK_ROWS = 5;
const BRICK_GAP_X = 0.15;
const BRICK_GAP_Z = 0.32;
const BALL_SPEED = 9;
const PADDLE_Z = AREA_H / 2 - 1;
const PADDLE_LIMIT = AREA_W / 2 - PADDLE_W / 2;

type GameState = 'waiting' | 'playing' | 'dead' | 'won';

export type Callbacks = {
  onScore: (s: number) => void;
  onLives: (l: number) => void;
  onGameOver: () => void;
  onWin: () => void;
};

type Brick = { x: number; z: number; mesh: THREE.Mesh; alive: boolean };

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

export function createBreakoutGame(canvas: HTMLCanvasElement, cb: Callbacks) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080f);
  scene.fog = new THREE.FogExp2(0x07080f, 0.022);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, 22, 9);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0x334466, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(5, 15, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  const accentLight = new THREE.PointLight(0x4488ff, 3, 24);
  accentLight.position.set(0, 5, 0);
  scene.add(accentLight);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(AREA_W, AREA_H),
    new THREE.MeshStandardMaterial({ color: 0x0d1120, roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(Math.max(AREA_W, AREA_H), 20, 0x1a2840, 0x111828);
  grid.position.y = 0.01;
  scene.add(grid);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a2840, roughness: 0.8, emissive: 0x0a1428, emissiveIntensity: 0.3 });
  const wallThick = 0.5;
  const wallH = 0.5;

  const leftW = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallH, AREA_H + wallThick * 2), wallMat);
  leftW.position.set(-(AREA_W / 2 + wallThick / 2), wallH / 2, 0);
  scene.add(leftW);

  const rightW = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallH, AREA_H + wallThick * 2), wallMat);
  rightW.position.set(AREA_W / 2 + wallThick / 2, wallH / 2, 0);
  scene.add(rightW);

  const topW = new THREE.Mesh(new THREE.BoxGeometry(AREA_W + wallThick * 2, wallH, wallThick), wallMat);
  topW.position.set(0, wallH / 2, -(AREA_H / 2 + wallThick / 2));
  scene.add(topW);

  const paddleMat = new THREE.MeshStandardMaterial({
    color: 0x4499ff,
    emissive: 0x2255cc,
    emissiveIntensity: 0.45,
    roughness: 0.2,
    metalness: 0.3,
  });
  const paddleMesh = new THREE.Mesh(new THREE.BoxGeometry(PADDLE_W, 0.3, PADDLE_D), paddleMat);
  paddleMesh.position.set(0, 0.15, PADDLE_Z);
  paddleMesh.castShadow = true;
  scene.add(paddleMesh);

  const paddleGlow = new THREE.PointLight(0x4499ff, 4, 6);
  paddleGlow.position.set(0, 0.5, PADDLE_Z);
  scene.add(paddleGlow);

  const ballMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xaaddff,
    emissiveIntensity: 0.6,
    roughness: 0.1,
    metalness: 0.2,
  });
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 16, 12), ballMat);
  ballMesh.castShadow = true;
  scene.add(ballMesh);

  const ballGlow = new THREE.PointLight(0xaaddff, 5, 3);
  scene.add(ballGlow);

  const BRICK_COLORS = [0xff2255, 0xff6600, 0xffcc00, 0x00cc66, 0x4488ff];
  const bricks: Brick[] = [];

  const totalBrickW = BRICK_COLS * BRICK_W + (BRICK_COLS - 1) * BRICK_GAP_X;
  const brickStartX = -totalBrickW / 2 + BRICK_W / 2;
  const brickStartZ = -AREA_H / 2 + 2;

  for (let row = 0; row < BRICK_ROWS; row++) {
    const color = BRICK_COLORS[row % BRICK_COLORS.length];
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.25,
      roughness: 0.3,
      metalness: 0.1,
    });
    for (let col = 0; col < BRICK_COLS; col++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(BRICK_W, 0.3, BRICK_D), mat);
      const x = brickStartX + col * (BRICK_W + BRICK_GAP_X);
      const z = brickStartZ + row * (BRICK_D + BRICK_GAP_Z);
      mesh.position.set(x, 0.15, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      bricks.push({ x, z, mesh, alive: true });
    }
  }

  let paddleX = 0;
  let targetX = 0;
  let ballX = 0;
  let ballZ = PADDLE_Z - 0.8;
  let ballVX = 0;
  let ballVZ = 0;
  let score = 0;
  let lives = 3;
  let gameState: GameState = 'waiting';
  let animId = 0;
  let lastTime = 0;
  let tick = 0;
  const keys: Record<string, boolean> = {};

  function launch() {
    if (gameState !== 'waiting') return;
    const angle = -Math.PI / 2 + (Math.random() * 0.6 - 0.3);
    ballVX = Math.cos(angle) * BALL_SPEED;
    ballVZ = Math.sin(angle) * BALL_SPEED;
    gameState = 'playing';
  }

  function resetBall() {
    ballX = paddleX;
    ballZ = PADDLE_Z - 0.8;
    ballVX = 0;
    ballVZ = 0;
    gameState = 'waiting';
  }

  function onMouseMove(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    targetX = ((e.clientX - rect.left) / rect.width - 0.5) * AREA_W * 0.95;
  }

  function onMouseClick() { launch(); }

  function onTouchStart(e: TouchEvent) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    targetX = ((e.touches[0].clientX - rect.left) / rect.width - 0.5) * AREA_W * 0.95;
    launch();
  }

  function onTouchMove(e: TouchEvent) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    targetX = ((e.touches[0].clientX - rect.left) / rect.width - 0.5) * AREA_W * 0.95;
  }

  function onKeyDown(e: KeyboardEvent) {
    keys[e.key] = true;
    if (e.key === ' ' || e.key === 'Enter') launch();
  }

  function onKeyUp(e: KeyboardEvent) { keys[e.key] = false; }

  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('click', onMouseClick);
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  function update(dt: number) {
    const keySpeed = 12;
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) targetX -= keySpeed * dt;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) targetX += keySpeed * dt;
    targetX = clamp(targetX, -PADDLE_LIMIT, PADDLE_LIMIT);

    paddleX += (targetX - paddleX) * Math.min(1, dt * 16);
    paddleX = clamp(paddleX, -PADDLE_LIMIT, PADDLE_LIMIT);
    paddleMesh.position.x = paddleX;
    paddleGlow.position.x = paddleX;

    if (gameState === 'waiting') {
      ballX = paddleX;
      ballZ = PADDLE_Z - 0.8;
      ballMesh.position.set(ballX, BALL_R + 0.05, ballZ);
      ballGlow.position.set(ballX, BALL_R + 0.5, ballZ);
      return;
    }

    if (gameState !== 'playing') return;

    ballX += ballVX * dt;
    ballZ += ballVZ * dt;

    // Side walls
    if (ballX - BALL_R < -AREA_W / 2) { ballX = -AREA_W / 2 + BALL_R; ballVX = Math.abs(ballVX); }
    if (ballX + BALL_R > AREA_W / 2) { ballX = AREA_W / 2 - BALL_R; ballVX = -Math.abs(ballVX); }

    // Top wall
    if (ballZ - BALL_R < -AREA_H / 2) { ballZ = -AREA_H / 2 + BALL_R; ballVZ = Math.abs(ballVZ); }

    // Lost ball
    if (ballZ > AREA_H / 2 + 2) {
      lives--;
      cb.onLives(lives);
      if (lives <= 0) {
        gameState = 'dead';
        cb.onGameOver();
      } else {
        resetBall();
      }
      return;
    }

    // Paddle collision
    const pHalfW = PADDLE_W / 2;
    const pHalfD = PADDLE_D / 2;
    if (
      ballVZ > 0 &&
      ballX > paddleX - pHalfW - BALL_R &&
      ballX < paddleX + pHalfW + BALL_R &&
      ballZ > PADDLE_Z - pHalfD - BALL_R &&
      ballZ < PADDLE_Z + pHalfD + BALL_R
    ) {
      ballZ = PADDLE_Z - pHalfD - BALL_R;
      ballVZ = -Math.abs(ballVZ);
      const rel = clamp((ballX - paddleX) / pHalfW, -1, 1);
      ballVX = rel * BALL_SPEED * 0.8;
      const spd = Math.sqrt(ballVX ** 2 + ballVZ ** 2);
      ballVX = (ballVX / spd) * BALL_SPEED;
      ballVZ = (ballVZ / spd) * BALL_SPEED;
    }

    // Brick collisions
    const bHalfW = BRICK_W / 2;
    const bHalfD = BRICK_D / 2;

    for (const brick of bricks) {
      if (!brick.alive) continue;
      const dx = Math.abs(ballX - brick.x);
      const dz = Math.abs(ballZ - brick.z);
      if (dx < bHalfW + BALL_R && dz < bHalfD + BALL_R) {
        brick.alive = false;
        scene.remove(brick.mesh);
        score += 10;
        cb.onScore(score);
        const overlapX = bHalfW + BALL_R - dx;
        const overlapZ = bHalfD + BALL_R - dz;
        if (overlapX < overlapZ) ballVX = -ballVX;
        else ballVZ = -ballVZ;
        if (bricks.every(b => !b.alive)) {
          gameState = 'won';
          cb.onWin();
        }
        break;
      }
    }

    ballMesh.position.set(ballX, BALL_R + 0.05, ballZ);
    ballGlow.position.set(ballX, BALL_R + 0.5, ballZ);
  }

  function loop(ts: number) {
    animId = requestAnimationFrame(loop);
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    tick += dt;
    update(dt);
    accentLight.position.x = Math.sin(tick * 0.25) * 6;
    accentLight.position.z = Math.cos(tick * 0.25) * 6;
    ballGlow.intensity = 4 + Math.sin(tick * 5) * 0.6;
    renderer.render(scene, camera);
  }

  function resize() {
    const w = canvas.clientWidth || canvas.offsetWidth;
    const h = canvas.clientHeight || canvas.offsetHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the full play area visible on all aspect ratios.
    // AREA_W/AREA_H = 14/20 = 0.7 — on screens narrower than this, zoom out to fit width.
    camera.zoom = Math.min(1, (w / h) * (AREA_H / AREA_W));
    camera.updateProjectionMatrix();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement ?? canvas);
  resize();

  ballMesh.position.set(0, BALL_R + 0.05, PADDLE_Z - 0.8);
  ballGlow.position.set(0, BALL_R + 0.5, PADDLE_Z - 0.8);

  animId = requestAnimationFrame((ts) => { lastTime = ts; loop(ts); });

  return {
    restart() {
      for (const brick of bricks) {
        if (!brick.alive) { brick.alive = true; scene.add(brick.mesh); }
      }
      score = 0;
      lives = 3;
      paddleX = 0;
      targetX = 0;
      cb.onScore(0);
      cb.onLives(3);
      resetBall();
    },
    destroy() {
      cancelAnimationFrame(animId);
      ro.disconnect();
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('click', onMouseClick);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      renderer.dispose();
    },
  };
}
