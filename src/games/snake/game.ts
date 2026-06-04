import * as THREE from 'three';

type Vec2 = { x: number; y: number };
type Direction = 'up' | 'down' | 'left' | 'right';
type FoodType = 'normal' | 'ghost' | 'multiplier';

const GRID = 20;
const CELL = 1;
const TICK_BASE = 140;
const TICK_MIN = 65;

type State = {
  snake: Vec2[];
  dir: Direction;
  nextDir: Direction;
  food: Vec2;
  foodType: FoodType;
  score: number;
  alive: boolean;
  ghostUntil: number;
  multiplierLeft: number;
  eatCount: number;
};

type Callbacks = {
  onScore: (score: number,) => void;
  onDeath: () => void;
  onPowerUp?: (label: string,) => void;
};

type Particle = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
};

function rndCell(exclude: Vec2[],): Vec2 {
  let c: Vec2;
  do {
    c = { x: Math.floor(Math.random() * GRID,), y: Math.floor(Math.random() * GRID,), };
  } while (exclude.some((e,) => e.x === c.x && e.y === c.y,));
  return c;
}

function toWorld(c: Vec2,): THREE.Vector3 {
  const off = (GRID - 1) / 2;
  return new THREE.Vector3((c.x - off) * CELL, 0, (c.y - off) * CELL,);
}

function initSnake(): Vec2[] {
  return [{ x: 10, y: 10, }, { x: 9, y: 10, }, { x: 8, y: 10, },];
}

function dirRotationY(dir: Direction,): number {
  if (dir === 'right') return -Math.PI / 2;
  if (dir === 'left') return Math.PI / 2;
  if (dir === 'up') return Math.PI;
  return 0;
}

function pickFoodType(eatCount: number,): FoodType {
  if (eatCount % 5 === 4) return Math.random() < 0.5 ? 'ghost' : 'multiplier';
  return 'normal';
}

export function createSnakeGame(canvas: HTMLCanvasElement, callbacks: Callbacks,) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, },);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2,),);
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080f,);
  scene.fog = new THREE.FogExp2(0x07080f, 0.04,);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100,);
  const camBase = new THREE.Vector3(0, 19, 13,);
  camera.position.copy(camBase,);
  camera.lookAt(0, 0, 0,);

  scene.add(new THREE.AmbientLight(0x334466, 2,),);
  const sun = new THREE.DirectionalLight(0xffffff, 2.5,);
  sun.position.set(6, 12, 6,);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024,);
  scene.add(sun,);

  const accent = new THREE.PointLight(0x00ffaa, 3, 12,);
  accent.position.set(0, 4, 0,);
  scene.add(accent,);

  // Burst of light when eating food
  const flashLight = new THREE.PointLight(0xffffff, 0, 10,);
  scene.add(flashLight,);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID, GRID,),
    new THREE.MeshStandardMaterial({ color: 0x0d1120, roughness: 0.95, },),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -CELL * 0.5;
  floor.receiveShadow = true;
  scene.add(floor,);

  const grid = new THREE.GridHelper(GRID, GRID, 0x1a2840, 0x111828,);
  grid.position.y = -CELL * 0.5 + 0.01;
  scene.add(grid,);

  // Snake materials — normal and ghost-mode variants
  const headMat = new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00cc55, emissiveIntensity: 0.4, roughness: 0.25, },);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x00bb55, emissive: 0x004422, emissiveIntensity: 0.2, roughness: 0.4, },);
  const ghostHeadMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, emissive: 0x4488ff, emissiveIntensity: 0.9, roughness: 0.1, transparent: true, opacity: 0.65, },);
  const ghostBodyMat = new THREE.MeshStandardMaterial({ color: 0x4488ff, emissive: 0x2244cc, emissiveIntensity: 0.4, roughness: 0.3, transparent: true, opacity: 0.45, },);

  // Food materials per type
  const foodMatNormal = new THREE.MeshStandardMaterial({ color: 0xff2255, emissive: 0xcc1133, emissiveIntensity: 0.6, roughness: 0.2, },);
  const foodMatGhost = new THREE.MeshStandardMaterial({ color: 0x44aaff, emissive: 0x2266ff, emissiveIntensity: 1.0, roughness: 0.1, },);
  const foodMatMultiplier = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xff8800, emissiveIntensity: 0.9, roughness: 0.1, },);

  // Head is slightly elongated so rotation shows facing direction
  const headGeo = new THREE.BoxGeometry(CELL * 0.78, CELL * 0.78, CELL * 0.95,);
  const segGeo = new THREE.BoxGeometry(CELL * 0.82, CELL * 0.82, CELL * 0.82,);

  // Food shapes per type: spiky / smooth / diamond
  const foodGeoNormal = new THREE.IcosahedronGeometry(CELL * 0.42, 1,);
  const foodGeoGhost = new THREE.SphereGeometry(CELL * 0.44, 10, 8,);
  const foodGeoMultiplier = new THREE.OctahedronGeometry(CELL * 0.50, 0,);

  const foodMesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material> = new THREE.Mesh(foodGeoNormal, foodMatNormal,);
  foodMesh.castShadow = true;
  scene.add(foodMesh,);

  const foodLight = new THREE.PointLight(0xff2255, 2, 4,);
  scene.add(foodLight,);

  const segments: THREE.Mesh[] = [];

  // Particle system — shared geometry, per-particle material for opacity
  const particles: Particle[] = [];
  const particleGeo = new THREE.SphereGeometry(0.1, 4, 3,);

  function spawnParticles(pos: THREE.Vector3, count: number, color: number,) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, },);
      const mesh = new THREE.Mesh(particleGeo, mat,);
      mesh.position.copy(pos,);
      scene.add(mesh,);
      const theta = Math.random() * Math.PI * 2;
      const cosP = Math.random() * 2 - 1;
      const sinP = Math.sqrt(1 - cosP * cosP,);
      const speed = 2.5 + Math.random() * 5;
      particles.push({
        mesh,
        vel: new THREE.Vector3(
          sinP * Math.cos(theta,) * speed,
          1.5 + Math.random() * 5,
          sinP * Math.sin(theta,) * speed,
        ),
        life: 1,
        maxLife: 0.3 + Math.random() * 0.35,
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

  let shakeAmt = 0;
  let flashIntensity = 0;

  function triggerShake(amount: number,) {
    shakeAmt = Math.max(shakeAmt, amount,);
  }

  function initState(): State {
    const fresh = initSnake();
    return {
      snake: fresh,
      dir: 'right',
      nextDir: 'right',
      food: rndCell(fresh,),
      foodType: 'normal',
      score: 0,
      alive: true,
      ghostUntil: 0,
      multiplierLeft: 0,
      eatCount: 0,
    };
  }

  let state: State = initState();

  function syncMeshes() {
    while (segments.length < state.snake.length) {
      const m = new THREE.Mesh(segGeo, bodyMat,);
      m.castShadow = true;
      scene.add(m,);
      segments.push(m,);
    }
    while (segments.length > state.snake.length) {
      scene.remove(segments.pop()!,);
    }

    const isGhost = performance.now() < state.ghostUntil;

    segments[0]!.geometry = headGeo;
    segments[0]!.material = isGhost ? ghostHeadMat : headMat;
    segments[0]!.rotation.y = dirRotationY(state.dir,);

    for (let i = 1; i < segments.length; i++) {
      segments[i]!.geometry = segGeo;
      segments[i]!.material = isGhost ? ghostBodyMat : bodyMat;
      segments[i]!.rotation.y = 0;
    }

    for (let i = 0; i < state.snake.length; i++) {
      segments[i]!.position.copy(toWorld(state.snake[i]!,),);
    }

    const fp = toWorld(state.food,);
    foodMesh.position.x = fp.x;
    foodMesh.position.z = fp.z;
    foodMesh.geometry = state.foodType === 'ghost' ? foodGeoGhost
      : state.foodType === 'multiplier' ? foodGeoMultiplier
      : foodGeoNormal;
    foodMesh.material = state.foodType === 'ghost' ? foodMatGhost
      : state.foodType === 'multiplier' ? foodMatMultiplier
      : foodMatNormal;

    const fLightColor = state.foodType === 'ghost' ? 0x44aaff
      : state.foodType === 'multiplier' ? 0xffcc00
      : 0xff2255;
    foodLight.color.set(fLightColor,);
    foodLight.position.x = fp.x;
    foodLight.position.z = fp.z;
  }

  function tick() {
    if (!state.alive) return;
    state.dir = state.nextDir;
    const h = state.snake[0]!;
    const next: Vec2 = { x: h.x, y: h.y, };
    if (state.dir === 'up') next.y -= 1;
    else if (state.dir === 'down') next.y += 1;
    else if (state.dir === 'left') next.x -= 1;
    else next.x += 1;

    const isGhost = performance.now() < state.ghostUntil;

    if (next.x < 0 || next.x >= GRID || next.y < 0 || next.y >= GRID) { die(); return; }
    if (!isGhost && state.snake.some((s,) => s.x === next.x && s.y === next.y,)) { die(); return; }

    const ate = next.x === state.food.x && next.y === state.food.y;
    state.snake = [next, ...state.snake,];
    if (!ate) {
      state.snake.pop();
    } else {
      state.eatCount++;
      const ft = state.foodType;

      if (ft === 'ghost') {
        state.ghostUntil = performance.now() + 5000;
        callbacks.onPowerUp?.('GHOST MODE',);
      } else if (ft === 'multiplier') {
        state.multiplierLeft = 3;
        callbacks.onPowerUp?.('3X SCORE',);
      }

      let points = 10;
      if (state.multiplierLeft > 0 && ft !== 'multiplier') {
        points = 30;
        state.multiplierLeft--;
      }
      state.score += points;
      callbacks.onScore(state.score,);

      const fp = toWorld(state.food,);
      const pColor = ft === 'ghost' ? 0x44aaff : ft === 'multiplier' ? 0xffcc00 : 0xff4488;
      spawnParticles(fp, ft === 'normal' ? 20 : 40, pColor,);

      flashIntensity = ft === 'normal' ? 5 : 12;
      flashLight.position.set(fp.x, 1, fp.z,);
      flashLight.color.set(pColor,);
      triggerShake(ft === 'normal' ? 0.07 : 0.2,);

      state.foodType = pickFoodType(state.eatCount,);
      state.food = rndCell(state.snake,);
    }
    syncMeshes();
  }

  function die() {
    state.alive = false;
    const hp = toWorld(state.snake[0]!,);
    spawnParticles(hp, 50, 0x00ff88,);
    for (let i = 1; i < Math.min(state.snake.length, 8,); i++) {
      spawnParticles(toWorld(state.snake[i]!,), 10, 0x00cc55,);
    }
    triggerShake(0.55,);
    callbacks.onDeath();
  }

  function onKey(e: KeyboardEvent,) {
    const d = state.dir;
    if ((e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') && d !== 'down') state.nextDir = 'up';
    else if ((e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') && d !== 'up') state.nextDir = 'down';
    else if ((e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') && d !== 'right') state.nextDir = 'left';
    else if ((e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') && d !== 'left') state.nextDir = 'right';
  }

  window.addEventListener('keydown', onKey,);

  function resize() {
    const w = canvas.clientWidth || canvas.offsetWidth;
    const h = canvas.clientHeight || canvas.offsetHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false,);
    const aspect = w / h;
    camera.aspect = aspect;
    camera.zoom = Math.min(1, aspect,);
    camera.updateProjectionMatrix();
  }

  const ro = new ResizeObserver(resize,);
  ro.observe(canvas.parentElement ?? canvas,);
  resize();
  syncMeshes();

  let animId = 0;
  let lastTick = 0;
  let lastFrame = 0;
  let bob = 0;

  function loop(ts: number,) {
    animId = requestAnimationFrame(loop,);
    const dt = lastFrame === 0 ? 0 : Math.min((ts - lastFrame) / 1000, 0.1,);
    lastFrame = ts;

    // Speed escalates as snake grows: -3ms per segment, capped at TICK_MIN
    const tickMs = Math.max(TICK_MIN, TICK_BASE - (state.snake.length - 3) * 3,);
    if (ts - lastTick >= tickMs) { lastTick = ts; tick(); }

    bob += 0.04;

    // Food bob, spin, and light tracking
    foodMesh.position.y = Math.sin(bob,) * 0.25 + 0.2;
    foodMesh.rotation.y = bob * 0.7;
    foodMesh.rotation.x = bob * 0.25;
    foodLight.position.y = foodMesh.position.y + 0.4;
    foodLight.intensity = 2 + Math.sin(bob * 2,) * 0.6;

    // Orbiting accent light
    accent.position.x = Math.sin(bob * 0.2,) * 3;
    accent.position.z = Math.cos(bob * 0.2,) * 3;

    // Flash light exponential decay
    if (flashIntensity > 0.05) {
      flashIntensity *= Math.exp(-10 * dt,);
      flashLight.intensity = flashIntensity;
    } else if (flashIntensity > 0) {
      flashIntensity = 0;
      flashLight.intensity = 0;
    }

    updateParticles(dt,);

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

    // Head breathing pulse
    if (segments[0]) {
      const pulse = 1 + Math.sin(bob * 4,) * 0.04;
      segments[0].scale.setScalar(pulse,);
    }

    renderer.render(scene, camera,);
  }

  animId = requestAnimationFrame(loop,);

  function cleanParticles() {
    for (const p of particles) {
      scene.remove(p.mesh,);
      (p.mesh.material as THREE.MeshBasicMaterial).dispose();
    }
    particles.length = 0;
  }

  return {
    restart() {
      cleanParticles();
      shakeAmt = 0;
      flashIntensity = 0;
      flashLight.intensity = 0;
      state = initState();
      callbacks.onScore(0,);
      syncMeshes();
    },
    destroy() {
      cancelAnimationFrame(animId,);
      ro.disconnect();
      window.removeEventListener('keydown', onKey,);
      cleanParticles();
      renderer.dispose();
    },
  };
}
