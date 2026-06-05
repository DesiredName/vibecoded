import * as THREE from 'three';

export type Phase = 'countdown' | 'flying' | 'landed' | 'crashed';

type Theme = {
  name: string;
  gravity: number;
  skyColor: number;
  groundColor: number;
  groundEdgeColor: number;
  starColor: number;
  particleColor: number;
  ambientColor: number;
  accentColor: number;
};

type Pad = {
  xMin: number;
  xMax: number;
  centerY: number;
  width: number;
  isBonus: boolean;
};

export type ScoreBreakdown = {
  base: number;
  speed: number;
  accuracy: number;
  fuel: number;
  tilt: number;
  total: number;
};

export type Callbacks = {
  onScore: (s: number) => void;
  onLevel: (l: number) => void;
  onFuel: (f: number) => void;
  onStreak: (s: number) => void;
  onPhase: (p: Phase) => void;
  onLanded: (breakdown: ScoreBreakdown) => void;
  onGameOver: () => void;
  onTheme: (name: string) => void;
};

const WORLD_W = 300;
const WORLD_HALF_W = 150;
const MAX_THRUST = 300;
const THRUST_DRAG = 0.98;
const ANGULAR_ACCEL = 4.0;
const ANGULAR_DRAG = 0.88;
const FUEL_MAX = 100;
const FUEL_RATE = 18;
const SAFE_VSPEED = 45;
const SAFE_HSPEED = 25;
const SAFE_ANGLE = 0.30;
const COUNTDOWN_SEC = 3;
const CAMERA_LERP = 5;

const THEMES: Record<string, Theme> = {
  moon: {
    name: 'Moon',
    gravity: 80,
    skyColor: 0x020408,
    groundColor: 0x3a3a4a,
    groundEdgeColor: 0x8888aa,
    starColor: 0xffffff,
    particleColor: 0xaaddff,
    ambientColor: 0x334466,
    accentColor: 0x6688cc,
  },
  mars: {
    name: 'Mars',
    gravity: 130,
    skyColor: 0x100504,
    groundColor: 0x6b3020,
    groundEdgeColor: 0xcc6644,
    starColor: 0xffddcc,
    particleColor: 0xff7744,
    ambientColor: 0x663322,
    accentColor: 0xff5522,
  },
  venus: {
    name: 'Venus',
    gravity: 190,
    skyColor: 0x040d08,
    groundColor: 0x1a4030,
    groundEdgeColor: 0x44cc88,
    starColor: 0xaaffdd,
    particleColor: 0x44ffaa,
    ambientColor: 0x224433,
    accentColor: 0x22ffaa,
  },
  jupiter: {
    name: 'Jupiter',
    gravity: 260,
    skyColor: 0x080601,
    groundColor: 0x5a3d10,
    groundEdgeColor: 0xffbb44,
    starColor: 0xffeeaa,
    particleColor: 0xffcc33,
    ambientColor: 0x443310,
    accentColor: 0xffaa22,
  },
};

const THEME_KEYS = Object.keys(THEMES);

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createMoonLandingGame(
  canvas: HTMLCanvasElement,
  cb: Callbacks,
) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();

  const camera = new THREE.OrthographicCamera(
    -WORLD_HALF_W, WORLD_HALF_W, 200, -200, 0.1, 1000,
  );
  camera.position.z = 10;

  const ambientLight = new THREE.AmbientLight(0x334466, 1.5);
  scene.add(ambientLight);

  const accentLight = new THREE.PointLight(0x6688cc, 3, 800);
  scene.add(accentLight);
  let accentAngle = 0;

  const shipGlow = new THREE.PointLight(0x6688cc, 2, 120);
  scene.add(shipGlow);

  const thrusterGlow = new THREE.PointLight(0xaaddff, 0, 80);
  scene.add(thrusterGlow);

  // Star field spread across world width and full vertical range
  const starCount = 400;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPositions[i * 3] = (Math.random() - 0.5) * WORLD_W * 1.8;
    starPositions[i * 3 + 1] = Math.random() * 2200;
    starPositions[i * 3 + 2] = -1;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // Ship outline — triangle pointing up
  const shipGeo = new THREE.BufferGeometry();
  shipGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 12, 0,
    -8, -8, 0,
    0, -3, 0,
    8, -8, 0,
    0, 12, 0,
  ]), 3));
  const shipMat = new THREE.LineBasicMaterial({ color: 0xaaddff, });
  const shipMesh = new THREE.Line(shipGeo, shipMat);
  scene.add(shipMesh);

  // Thruster flame
  const flamGeo = new THREE.BufferGeometry();
  flamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -4, -8, 0,
    0, -22, 0,
    4, -8, 0,
  ]), 3));
  const flamMat = new THREE.LineBasicMaterial({ color: 0xaaddff, });
  const flamMesh = new THREE.Line(flamGeo, flamMat);
  flamMesh.visible = false;
  scene.add(flamMesh);

  // Terrain state
  let terrainMesh: THREE.Mesh | null = null;
  let edgeMesh: THREE.Line | null = null;
  let padMeshes: THREE.Mesh[] = [];
  let heightmap = new Float32Array(WORLD_W + 1);
  let pads: Pad[] = [];

  function disposeTerrainMesh() {
    if (terrainMesh) {
      scene.remove(terrainMesh);
      terrainMesh.geometry.dispose();
      (terrainMesh.material as THREE.Material).dispose();
      terrainMesh = null;
    }
    if (edgeMesh) {
      scene.remove(edgeMesh);
      edgeMesh.geometry.dispose();
      (edgeMesh.material as THREE.Material).dispose();
      edgeMesh = null;
    }
    for (const pm of padMeshes) {
      scene.remove(pm);
      pm.geometry.dispose();
      (pm.material as THREE.Material).dispose();
    }
    padMeshes = [];
    pads = [];
  }

  function generateTerrain(seed: number, levelNum: number, t: Theme): Pad {
    disposeTerrainMesh();
    const rng = mulberry32(seed);

    const groundBase = 40;
    const maxHeightVar = 80 + levelNum * 15;
    const numCtrl = 20 + Math.floor(rng() * 8);

    const ctrlPts: THREE.Vector3[] = [];
    for (let i = 0; i <= numCtrl; i++) {
      const x = -WORLD_HALF_W + (i / numCtrl) * WORLD_W;
      const y = groundBase + rng() * maxHeightVar;
      ctrlPts.push(new THREE.Vector3(x, y, 0));
    }

    const curve = new THREE.CatmullRomCurve3(ctrlPts, false, 'chordal');
    heightmap = new Float32Array(WORLD_W + 1);
    for (let i = 0; i <= WORLD_W; i++) {
      heightmap[i] = curve.getPoint(i / WORLD_W).y;
    }

    // Stamp primary flat landing pad
    const padWidth = Math.max(30, 60 - (levelNum - 1) * 5);
    const padMargin = 30;
    const padStart = padMargin + Math.floor(rng() * (WORLD_W - padWidth - padMargin * 2));
    const padCenterIdx = padStart + Math.floor(padWidth / 2);
    const padY = heightmap[padCenterIdx];
    for (let i = padStart; i <= Math.min(WORLD_W, padStart + padWidth); i++) {
      heightmap[i] = padY;
    }

    const pad: Pad = {
      xMin: -WORLD_HALF_W + padStart,
      xMax: -WORLD_HALF_W + padStart + padWidth,
      centerY: padY,
      width: padWidth,
      isBonus: false,
    };
    pads = [pad];

    // Filled terrain polygon
    const shape = new THREE.Shape();
    shape.moveTo(-WORLD_HALF_W, 0);
    shape.lineTo(-WORLD_HALF_W, heightmap[0]);
    for (let i = 1; i <= WORLD_W; i++) {
      shape.lineTo(-WORLD_HALF_W + i, heightmap[i]);
    }
    shape.lineTo(WORLD_HALF_W, 0);
    shape.closePath();

    const terrainGeo = new THREE.ShapeGeometry(shape);
    const terrainMat = new THREE.MeshBasicMaterial({ color: t.groundColor, });
    terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.position.z = 0;
    scene.add(terrainMesh);

    // Edge highlight
    const edgePts: THREE.Vector3[] = [];
    for (let i = 0; i <= WORLD_W; i++) {
      edgePts.push(new THREE.Vector3(-WORLD_HALF_W + i, heightmap[i], 0.05));
    }
    const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePts);
    const edgeMatObj = new THREE.LineBasicMaterial({ color: t.groundEdgeColor, });
    edgeMesh = new THREE.Line(edgeGeo, edgeMatObj);
    scene.add(edgeMesh);

    // Landing pad bar
    const padGeo = new THREE.PlaneGeometry(pad.width, 5);
    const padMatObj = new THREE.MeshBasicMaterial({ color: 0x44ff44, });
    const padMeshObj = new THREE.Mesh(padGeo, padMatObj);
    padMeshObj.position.set((pad.xMin + pad.xMax) / 2, pad.centerY + 2.5, 0.08);
    scene.add(padMeshObj);
    padMeshes = [padMeshObj];

    return pad;
  }

  // Game state
  let phase: Phase = 'countdown';
  let level = 1;
  let score = 0;
  let streak = 0;
  let fuel = FUEL_MAX;
  let countdownTimer = COUNTDOWN_SEC;
  let globalTime = 0;
  let shakeAmt = 0;
  let theme: Theme = THEMES['moon'];

  const shipPos = new THREE.Vector2(0, 600);
  const shipVel = new THREE.Vector2(0, 0);
  let shipAngle = 0;
  let angularVel = 0;

  const controls = { thrust: 0, tilt: 0, };

  function applyTheme(t: Theme) {
    theme = t;
    scene.background = new THREE.Color(t.skyColor);
    ambientLight.color.setHex(t.ambientColor);
    accentLight.color.setHex(t.accentColor);
    shipMat.color.setHex(t.accentColor);
    flamMat.color.setHex(t.particleColor);
    shipGlow.color.setHex(t.accentColor);
    thrusterGlow.color.setHex(t.particleColor);
    starMat.color.setHex(t.starColor);
    cb.onTheme(t.name);
  }

  function startLevel() {
    fuel = FUEL_MAX;
    countdownTimer = COUNTDOWN_SEC;
    phase = 'countdown';

    const themeKey = THEME_KEYS[Math.floor(Math.random() * THEME_KEYS.length)];
    applyTheme(THEMES[themeKey]);

    const seed = (Math.random() * 0xffffffff) >>> 0;
    const pad = generateTerrain(seed, level, theme);

    const spawnOffset = (Math.random() - 0.5) * 120;
    const padCenterX = (pad.xMin + pad.xMax) / 2;
    const spawnX = Math.max(
      -WORLD_HALF_W + 20,
      Math.min(WORLD_HALF_W - 20, padCenterX + spawnOffset),
    );
    const spawnAlt = Math.min(1400, 600 + level * 50);
    shipPos.set(spawnX, pad.centerY + spawnAlt);
    shipVel.set(0, 0);
    shipAngle = 0;
    angularVel = 0;
    flamMesh.visible = false;

    // Snap camera to ship so there is no initial pan
    camera.position.y = shipPos.y;

    cb.onLevel(level);
    cb.onFuel(fuel);
    cb.onPhase(phase);
  }

  function getTerrainHeight(wx: number): number {
    const xi = Math.round(wx + WORLD_HALF_W);
    return heightmap[Math.max(0, Math.min(WORLD_W, xi))];
  }

  function doLand() {
    if (phase !== 'flying') return;
    phase = 'landed';
    flamMesh.visible = false;

    const pad = pads.find(p => shipPos.x >= p.xMin && shipPos.x <= p.xMax) ?? pads[0];
    const padCenter = (pad.xMin + pad.xMax) / 2;
    const dist = Math.abs(shipPos.x - padCenter);

    const speedBonus = Math.abs(shipVel.y) <= 10 ? 200 : Math.abs(shipVel.y) <= 25 ? 100 : 0;
    const accuracyBonus = dist <= 5 ? 300 : dist <= 15 ? 150 : 0;
    const fuelBonus = Math.floor(fuel * 8);
    const tiltBonus = Math.abs(shipAngle) <= 0.05 ? 150 : 0;
    const base = 500;
    const mult = pad.isBonus ? 2 : 1;
    const total = (base + speedBonus + accuracyBonus + fuelBonus + tiltBonus) * mult;

    score += total;
    streak++;
    cb.onScore(score);
    cb.onStreak(streak);
    cb.onPhase(phase);
    cb.onLanded({ base, speed: speedBonus, accuracy: accuracyBonus, fuel: fuelBonus, tilt: tiltBonus, total, });
  }

  function doCrash() {
    if (phase !== 'flying') return;
    phase = 'crashed';
    flamMesh.visible = false;
    streak = 0;
    shakeAmt = 0.8;
    cb.onStreak(0);
    cb.onPhase(phase);
    cb.onGameOver();
  }

  function checkCollision() {
    const h = getTerrainHeight(shipPos.x);
    if (shipPos.y - 8 > h + 1) return;

    const onPad = pads.some(p => shipPos.x >= p.xMin && shipPos.x <= p.xMax);
    if (onPad) {
      const safeV = Math.abs(shipVel.y) <= SAFE_VSPEED;
      const safeH = Math.abs(shipVel.x) <= SAFE_HSPEED;
      const safeA = Math.abs(shipAngle) <= SAFE_ANGLE;
      if (safeV && safeH && safeA) doLand();
      else doCrash();
    } else {
      doCrash();
    }
  }

  const keys: Record<string, boolean> = {};
  const onKeyDown = (e: KeyboardEvent) => { keys[e.code] = true; };
  const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  let visibleHalfH = 200;

  function updateSize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    visibleHalfH = WORLD_HALF_W * (h / w);
    camera.top = visibleHalfH;
    camera.bottom = -visibleHalfH;
    camera.updateProjectionMatrix();
  }

  const resizeObs = new ResizeObserver(updateSize);
  resizeObs.observe(canvas);
  updateSize();

  startLevel();

  let rafId = 0;
  let lastTime = performance.now();

  const tick = () => {
    rafId = requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    globalTime += dt;

    accentAngle += dt * 0.2;
    accentLight.position.set(
      Math.cos(accentAngle) * 500,
      100 + Math.sin(accentAngle * 0.4) * 100,
      8,
    );

    if (phase === 'countdown') {
      countdownTimer -= dt;
      if (countdownTimer <= 0) {
        phase = 'flying';
        cb.onPhase(phase);
      }
    } else if (phase === 'flying') {
      const thrustKey = !!(keys['KeyW'] || keys['ArrowUp']);
      const tiltLeft = !!(keys['KeyA'] || keys['ArrowLeft']);
      const tiltRight = !!(keys['KeyD'] || keys['ArrowRight']);

      const thrustIn = Math.max(thrustKey ? 1.0 : 0, controls.thrust);
      const tiltIn = Math.max(-1, Math.min(1, (tiltRight ? 1 : 0) - (tiltLeft ? 1 : 0) + controls.tilt));

      const effectiveThrust = fuel > 0 ? thrustIn : 0;
      fuel = Math.max(0, fuel - effectiveThrust * FUEL_RATE * dt);
      cb.onFuel(fuel);

      const drag = Math.pow(THRUST_DRAG, dt * 60);
      shipVel.x += Math.sin(shipAngle) * effectiveThrust * MAX_THRUST * dt;
      shipVel.y += Math.cos(shipAngle) * effectiveThrust * MAX_THRUST * dt - theme.gravity * dt;
      shipVel.x *= drag;
      shipVel.y *= drag;

      const angDrag = Math.pow(ANGULAR_DRAG, dt * 60);
      angularVel += tiltIn * ANGULAR_ACCEL * dt;
      angularVel *= angDrag;
      shipAngle += angularVel * dt;

      shipPos.x += shipVel.x * dt;
      shipPos.y += shipVel.y * dt;
      shipPos.x = Math.max(-WORLD_HALF_W + 10, Math.min(WORLD_HALF_W - 10, shipPos.x));

      shipMesh.position.set(shipPos.x, shipPos.y, 0.30);
      shipMesh.rotation.z = -shipAngle;
      flamMesh.position.set(shipPos.x, shipPos.y, 0.32);
      flamMesh.rotation.z = -shipAngle;
      flamMesh.visible = effectiveThrust > 0;

      shipGlow.position.set(shipPos.x, shipPos.y, 3);
      shipGlow.intensity = 2 + Math.sin(globalTime * 2) * 0.5;

      const thrX = shipPos.x - Math.sin(shipAngle) * 14;
      const thrY = shipPos.y - Math.cos(shipAngle) * 14;
      thrusterGlow.position.set(thrX, thrY, 3);
      thrusterGlow.intensity = effectiveThrust * 8;

      checkCollision();
    }

    // Soft camera follow — lerp toward ship Y, floor to keep ground visible
    const targetCamY = Math.max(shipPos.y, visibleHalfH + 10);
    const lerp = 1 - Math.exp(-CAMERA_LERP * dt);
    camera.position.y += (targetCamY - camera.position.y) * lerp;

    if (shakeAmt > 0.002) {
      shakeAmt *= Math.exp(-6 * dt);
      camera.position.x = (Math.random() - 0.5) * shakeAmt * 20;
    } else if (shakeAmt !== 0) {
      shakeAmt = 0;
      camera.position.x = 0;
    }

    renderer.render(scene, camera);
  };

  tick();

  return {
    controls,
    get countdownTimer() { return countdownTimer; },
    get phase() { return phase; },
    restart() {
      level = 1;
      score = 0;
      streak = 0;
      shakeAmt = 0;
      cb.onScore(0);
      cb.onStreak(0);
      startLevel();
    },
    nextLevel() {
      level++;
      startLevel();
    },
    destroy() {
      cancelAnimationFrame(rafId);
      resizeObs.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      disposeTerrainMesh();
      scene.remove(shipMesh, flamMesh, stars);
      shipGeo.dispose();
      shipMat.dispose();
      flamGeo.dispose();
      flamMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      renderer.dispose();
    },
  };
}
