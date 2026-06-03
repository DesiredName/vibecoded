import * as THREE from 'three';

type AsteroidSize = 'large' | 'medium' | 'small';

type Asteroid = {
  mesh: THREE.Line;
  velocity: THREE.Vector2;
  size: AsteroidSize;
  radius: number;
  rotSpeed: number;
};

type Bullet = {
  mesh: THREE.Points;
  velocity: THREE.Vector2;
  life: number;
};

export type Callbacks = {
  onScore: (s: number) => void;
  onLives: (l: number) => void;
  onGameOver: () => void;
};

const ASTEROID_RADIUS = { large: 40, medium: 22, small: 12, } as const;
const ASTEROID_SCORE = { large: 20, medium: 50, small: 100, } as const;

const BULLET_SPEED = 350;
const BULLET_LIFE = 1.8;
const SHIP_ACCEL = 200;
const SHIP_DRAG = 0.995;
const TURN_SPEED = 3.2;
const MAX_BULLETS = 5;
const INVINCIBLE_DURATION = 2.5;
const INITIAL_ASTEROID_COUNT = 4;
const WORLD_HALF_H = 200;

export function createAsteroidsGame(
  canvas: HTMLCanvasElement,
  cb: Callbacks,
) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, },);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2,),);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060610,);

  let worldW = WORLD_HALF_H;
  const worldH = WORLD_HALF_H;

  const camera = new THREE.OrthographicCamera(
    -worldW, worldW, worldH, -worldH, 0.1, 100,
  );
  camera.position.z = 10;

  // Star field
  const starCount = 400;
  const starPos = new Float32Array(starCount * 3,);
  for (let i = 0; i < starCount; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 1200;
    starPos[i * 3 + 1] = (Math.random() - 0.5) * 600;
    starPos[i * 3 + 2] = 0;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3,),);
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, },);
  const starMesh = new THREE.Points(starGeo, starMat,);
  scene.add(starMesh,);

  // Ship outline (nose → left wing → center-back → right wing → nose)
  const shipGeo = new THREE.BufferGeometry();
  shipGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 14, 0,
    -9, -10, 0,
    0, -5, 0,
    9, -10, 0,
    0, 14, 0,
  ],), 3,),);
  const shipMat = new THREE.LineBasicMaterial({ color: 0x00ffcc, },);
  const shipMesh = new THREE.Line(shipGeo, shipMat,);
  scene.add(shipMesh,);

  // Thruster flame (shown while thrusting)
  const flamGeo = new THREE.BufferGeometry();
  flamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -5, -10, 0,
    0, -24, 0,
    5, -10, 0,
  ],), 3,),);
  const flamMat = new THREE.LineBasicMaterial({ color: 0xff6600, },);
  const flamMesh = new THREE.Line(flamGeo, flamMat,);
  flamMesh.visible = false;
  scene.add(flamMesh,);

  // State
  let score = 0;
  let lives = 3;
  let gameOver = false;
  let invTimer = 0;
  let wave = 1;
  let lastShot = 0;

  const shipPos = new THREE.Vector2(0, 0,);
  const shipVel = new THREE.Vector2(0, 0,);
  let shipAngle = 0;

  let asteroids: Asteroid[] = [];
  let bullets: Bullet[] = [];

  // Exposed to Vue component so touch events can drive the controls
  const controls = { left: false, right: false, thrust: false, fire: false, };

  const keys: Record<string, boolean> = {};

  const wrapPos = (pos: THREE.Vector2,) => {
    if (pos.x > worldW) pos.x -= worldW * 2;
    else if (pos.x < -worldW) pos.x += worldW * 2;
    if (pos.y > worldH) pos.y -= worldH * 2;
    else if (pos.y < -worldH) pos.y += worldH * 2;
  };

  const makeAsteroid = (
    x: number,
    y: number,
    size: AsteroidSize,
    vx: number,
    vy: number,
  ): Asteroid => {
    const r = ASTEROID_RADIUS[size];
    const segments = 10 + Math.floor(Math.random() * 5,);
    const verts: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const rr = r * (0.7 + Math.random() * 0.6);
      verts.push(Math.cos(a,) * rr, Math.sin(a,) * rr, 0,);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts,), 3,),);
    const mat = new THREE.LineBasicMaterial({ color: 0x999999, },);
    const mesh = new THREE.Line(geo, mat,);
    mesh.position.set(x, y, 0,);
    scene.add(mesh,);
    return {
      mesh,
      velocity: new THREE.Vector2(vx, vy,),
      size,
      radius: r,
      rotSpeed: (Math.random() - 0.5) * 1.5,
    };
  };

  const spawnWave = () => {
    const count = INITIAL_ASTEROID_COUNT + wave - 1;
    for (let i = 0; i < count; i++) {
      let x: number, y: number;
      do {
        x = (Math.random() - 0.5) * worldW * 1.8;
        y = (Math.random() - 0.5) * worldH * 1.8;
      } while (Math.hypot(x, y,) < 80);
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 30;
      asteroids.push(makeAsteroid(x, y, 'large', Math.cos(angle,) * speed, Math.sin(angle,) * speed,),);
    }
  };

  const fireBullet = () => {
    const now = performance.now();
    if (bullets.length >= MAX_BULLETS || gameOver || invTimer > 0 || now - lastShot < 220) return;
    lastShot = now;
    const bx = shipPos.x + Math.sin(shipAngle,) * 16;
    const by = shipPos.y + Math.cos(shipAngle,) * 16;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0,],), 3,),);
    const mat = new THREE.PointsMaterial({ color: 0xffff44, size: 5, },);
    const mesh = new THREE.Points(geo, mat,);
    mesh.position.set(bx, by, 0,);
    scene.add(mesh,);
    bullets.push({
      mesh,
      velocity: new THREE.Vector2(
        Math.sin(shipAngle,) * BULLET_SPEED + shipVel.x * 0.5,
        Math.cos(shipAngle,) * BULLET_SPEED + shipVel.y * 0.5,
      ),
      life: BULLET_LIFE,
    },);
  };

  const onKeyDown = (e: KeyboardEvent,) => {
    keys[e.code] = true;
    if (e.code === 'Space' && !gameOver) fireBullet();
  };
  const onKeyUp = (e: KeyboardEvent,) => { keys[e.code] = false; };

  window.addEventListener('keydown', onKeyDown,);
  window.addEventListener('keyup', onKeyUp,);

  const updateSize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false,);
    worldW = worldH * (w / h);
    camera.left = -worldW;
    camera.right = worldW;
    camera.updateProjectionMatrix();
  };

  const resizeObs = new ResizeObserver(updateSize,);
  resizeObs.observe(canvas,);
  updateSize();

  const removeAsteroid = (a: Asteroid,) => {
    scene.remove(a.mesh,);
    a.mesh.geometry.dispose();
    (a.mesh.material as THREE.Material).dispose();
  };

  const removeBullet = (b: Bullet,) => {
    scene.remove(b.mesh,);
    b.mesh.geometry.dispose();
    (b.mesh.material as THREE.Material).dispose();
  };

  const killShip = () => {
    if (invTimer > 0) return;
    lives--;
    cb.onLives(lives,);
    if (lives <= 0) {
      gameOver = true;
      shipMesh.visible = false;
      flamMesh.visible = false;
      cb.onGameOver();
      return;
    }
    shipPos.set(0, 0,);
    shipVel.set(0, 0,);
    shipAngle = 0;
    invTimer = INVINCIBLE_DURATION;
  };

  spawnWave();

  let rafId = 0;
  let lastTime = performance.now();

  const tick = () => {
    rafId = requestAnimationFrame(tick,);
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05,);
    lastTime = now;

    if (!gameOver) {
      const isLeft = !!(keys['ArrowLeft'] || keys['KeyA'] || controls.left);
      const isRight = !!(keys['ArrowRight'] || keys['KeyD'] || controls.right);
      const isThrust = !!(keys['ArrowUp'] || keys['KeyW'] || controls.thrust);
      const isFire = !!(keys['Space'] || controls.fire);

      if (isFire) fireBullet();

      shipAngle += ((isLeft ? -1 : 0) + (isRight ? 1 : 0)) * TURN_SPEED * dt;

      if (isThrust) {
        shipVel.x += Math.sin(shipAngle,) * SHIP_ACCEL * dt;
        shipVel.y += Math.cos(shipAngle,) * SHIP_ACCEL * dt;
      }

      const drag = Math.pow(SHIP_DRAG, dt * 60,);
      shipVel.multiplyScalar(drag,);

      shipPos.x += shipVel.x * dt;
      shipPos.y += shipVel.y * dt;
      wrapPos(shipPos,);

      shipMesh.position.set(shipPos.x, shipPos.y, 0,);
      shipMesh.rotation.z = -shipAngle;
      flamMesh.position.set(shipPos.x, shipPos.y, 0,);
      flamMesh.rotation.z = -shipAngle;

      if (invTimer > 0) {
        invTimer -= dt;
        const flicker = Math.floor(invTimer * 8,) % 2 === 0;
        shipMesh.visible = flicker;
        flamMesh.visible = isThrust && flicker;
        if (invTimer <= 0) {
          invTimer = 0;
          shipMesh.visible = true;
        }
      } else {
        flamMesh.visible = isThrust;
      }

      // Advance bullets, remove expired ones
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.life -= dt;
        if (b.life <= 0) {
          removeBullet(b,);
          bullets.splice(i, 1,);
          continue;
        }
        const bp = new THREE.Vector2(
          b.mesh.position.x + b.velocity.x * dt,
          b.mesh.position.y + b.velocity.y * dt,
        );
        wrapPos(bp,);
        b.mesh.position.set(bp.x, bp.y, 0,);
      }

      // Advance asteroids
      for (const a of asteroids) {
        const ap = new THREE.Vector2(
          a.mesh.position.x + a.velocity.x * dt,
          a.mesh.position.y + a.velocity.y * dt,
        );
        wrapPos(ap,);
        a.mesh.position.set(ap.x, ap.y, 0,);
        a.mesh.rotation.z += a.rotSpeed * dt;
      }

      // Bullet–asteroid collision
      const deadBullets = new Set<number>();
      const deadAsteroids = new Set<number>();
      const newAsteroids: Asteroid[] = [];

      for (let bi = 0; bi < bullets.length; bi++) {
        if (deadBullets.has(bi,)) continue;
        const b = bullets[bi];
        for (let ai = 0; ai < asteroids.length; ai++) {
          if (deadAsteroids.has(ai,)) continue;
          const a = asteroids[ai];
          const dx = b.mesh.position.x - a.mesh.position.x;
          const dy = b.mesh.position.y - a.mesh.position.y;
          if (Math.hypot(dx, dy,) < a.radius) {
            deadBullets.add(bi,);
            deadAsteroids.add(ai,);
            score += ASTEROID_SCORE[a.size];
            cb.onScore(score,);

            const nextSize: AsteroidSize | null =
              a.size === 'large' ? 'medium' : a.size === 'medium' ? 'small' : null;

            if (nextSize !== null) {
              const parentAngle = Math.atan2(a.velocity.y, a.velocity.x,);
              const childSpeed = a.velocity.length() * 1.4 + 40;
              const spread = Math.PI / 2.5;
              for (let ci = 0; ci < 2; ci++) {
                const ang = parentAngle + (ci === 0 ? spread : -spread) + (Math.random() - 0.5) * 0.4;
                newAsteroids.push(makeAsteroid(
                  a.mesh.position.x,
                  a.mesh.position.y,
                  nextSize,
                  Math.cos(ang,) * childSpeed,
                  Math.sin(ang,) * childSpeed,
                ),);
              }
            }
            break;
          }
        }
      }

      [...deadBullets,].sort((x, y,) => y - x,).forEach((bi,) => {
        removeBullet(bullets[bi],);
        bullets.splice(bi, 1,);
      },);

      [...deadAsteroids,].sort((x, y,) => y - x,).forEach((ai,) => {
        removeAsteroid(asteroids[ai],);
        asteroids.splice(ai, 1,);
      },);
      asteroids.push(...newAsteroids,);

      // Ship–asteroid collision
      if (invTimer <= 0) {
        for (const a of asteroids) {
          if (Math.hypot(shipPos.x - a.mesh.position.x, shipPos.y - a.mesh.position.y,) < a.radius + 8) {
            killShip();
            break;
          }
        }
      }

      if (asteroids.length === 0) {
        wave++;
        spawnWave();
      }
    }

    renderer.render(scene, camera,);
  };

  tick();

  const clearBodies = () => {
    asteroids.forEach(removeAsteroid,);
    asteroids = [];
    bullets.forEach(removeBullet,);
    bullets = [];
  };

  return {
    controls,
    restart() {
      clearBodies();
      score = 0;
      lives = 3;
      wave = 1;
      gameOver = false;
      invTimer = 0;
      shipPos.set(0, 0,);
      shipVel.set(0, 0,);
      shipAngle = 0;
      shipMesh.visible = true;
      flamMesh.visible = false;
      cb.onScore(score,);
      cb.onLives(lives,);
      spawnWave();
    },
    destroy() {
      cancelAnimationFrame(rafId,);
      resizeObs.disconnect();
      window.removeEventListener('keydown', onKeyDown,);
      window.removeEventListener('keyup', onKeyUp,);
      clearBodies();
      scene.remove(shipMesh, flamMesh, starMesh,);
      shipGeo.dispose();
      flamGeo.dispose();
      shipMat.dispose();
      flamMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      renderer.dispose();
    },
  };
}
