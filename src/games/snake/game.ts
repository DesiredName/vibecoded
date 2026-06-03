import * as THREE from 'three';

type Vec2 = { x: number; y: number };
type Direction = 'up' | 'down' | 'left' | 'right';

const GRID = 20;
const CELL = 1;
const TICK_MS = 140;

type State = {
  snake: Vec2[];
  dir: Direction;
  nextDir: Direction;
  food: Vec2;
  score: number;
  alive: boolean;
};

type Callbacks = {
  onScore: (score: number) => void;
  onDeath: () => void;
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

export function createSnakeGame(canvas: HTMLCanvasElement, callbacks: Callbacks,) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, },);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2,),);
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080f,);
  scene.fog = new THREE.FogExp2(0x07080f, 0.04,);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100,);
  camera.position.set(0, 19, 13,);
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

  const headMat = new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00cc55, emissiveIntensity: 0.4, roughness: 0.25, },);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x00bb55, emissive: 0x004422, emissiveIntensity: 0.2, roughness: 0.4, },);
  const foodMat = new THREE.MeshStandardMaterial({ color: 0xff2255, emissive: 0xcc1133, emissiveIntensity: 0.6, roughness: 0.2, },);

  const segGeo = new THREE.BoxGeometry(CELL * 0.82, CELL * 0.82, CELL * 0.82,);
  const foodGeo = new THREE.IcosahedronGeometry(CELL * 0.42, 1,);

  const foodMesh = new THREE.Mesh(foodGeo, foodMat,);
  foodMesh.castShadow = true;
  scene.add(foodMesh,);

  const foodLight = new THREE.PointLight(0xff2255, 2, 4,);
  scene.add(foodLight,);

  const segments: THREE.Mesh[] = [];

  let state: State = {
    snake: initSnake(),
    dir: 'right',
    nextDir: 'right',
    food: rndCell(initSnake(),),
    score: 0,
    alive: true,
  };

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
    segments[0].material = headMat;
    for (let i = 1; i < segments.length; i++) segments[i].material = bodyMat;
    for (let i = 0; i < state.snake.length; i++) {
      segments[i].position.copy(toWorld(state.snake[i],),);
    }
    const fp = toWorld(state.food,);
    foodMesh.position.x = fp.x;
    foodMesh.position.z = fp.z;
    foodLight.position.x = fp.x;
    foodLight.position.z = fp.z;
  }

  function tick() {
    if (!state.alive) return;
    state.dir = state.nextDir;
    const h = state.snake[0];
    const next: Vec2 = { x: h.x, y: h.y, };
    if (state.dir === 'up') next.y -= 1;
    else if (state.dir === 'down') next.y += 1;
    else if (state.dir === 'left') next.x -= 1;
    else next.x += 1;

    if (next.x < 0 || next.x >= GRID || next.y < 0 || next.y >= GRID) { die(); return; }
    if (state.snake.some((s,) => s.x === next.x && s.y === next.y,)) { die(); return; }

    const ate = next.x === state.food.x && next.y === state.food.y;
    state.snake = [next, ...state.snake,];
    if (!ate) {
      state.snake.pop();
    } else {
      state.score += 10;
      callbacks.onScore(state.score,);
      state.food = rndCell(state.snake,);
    }
    syncMeshes();
  }

  function die() {
    state.alive = false;
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
    // Zoom out on portrait viewports so the full grid stays visible.
    // At aspect >= 1 the horizontal FOV is wide enough; below 1 it clips.
    camera.zoom = Math.min(1, aspect,);
    camera.updateProjectionMatrix();
  }

  const ro = new ResizeObserver(resize,);
  ro.observe(canvas.parentElement ?? canvas,);
  resize();
  syncMeshes();

  let animId = 0;
  let lastTick = 0;
  let bob = 0;

  function loop(ts: number,) {
    animId = requestAnimationFrame(loop,);
    if (ts - lastTick >= TICK_MS) { lastTick = ts; tick(); }
    bob += 0.04;
    foodMesh.position.y = Math.sin(bob,) * 0.25;
    foodMesh.rotation.y = bob * 0.7;
    foodLight.position.y = foodMesh.position.y + 0.5;
    accent.position.x = Math.sin(bob * 0.2,) * 3;
    accent.position.z = Math.cos(bob * 0.2,) * 3;
    renderer.render(scene, camera,);
  }

  animId = requestAnimationFrame(loop,);

  return {
    restart() {
      const fresh = initSnake();
      state = { snake: fresh, dir: 'right', nextDir: 'right', food: rndCell(fresh,), score: 0, alive: true, };
      callbacks.onScore(0,);
      syncMeshes();
    },
    destroy() {
      cancelAnimationFrame(animId,);
      ro.disconnect();
      window.removeEventListener('keydown', onKey,);
      renderer.dispose();
    },
  };
}
