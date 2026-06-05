import * as THREE from 'three';

export type Phase = 'countdown' | 'flying' | 'landed' | 'crashed';
export type PickupType = 'fuel' | 'score' | 'slowmo';

type Theme = {
  name: string;
  gravity: number;
  fuelRate: number;
  skyColor: number;
  groundColor: number;
  groundEdgeColor: number;
  starColor: number;
  particleColor: number;
  ambientColor: number;
  accentColor: number;
  dustColor: number;
};

type Pad = {
  xMin: number;
  xMax: number;
  centerY: number;
  width: number;
  isBonus: boolean;
};

type Pickup = {
  mesh: THREE.Mesh;
  type: PickupType;
  x: number;
  y: number;
  driftVx: number;
};

type Particle = {
  active: boolean;
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  drag: number; grav: number;
  r: number; g: number; b: number;
};

type Debris = {
  mesh: THREE.Line;
  vx: number; vy: number;
  angVel: number;
  life: number; maxLife: number;
};

export type ScoreBreakdown = {
  base: number;
  speed: number;
  accuracy: number;
  fuel: number;
  tilt: number;
  streakBonus: number;
  isBullseye: boolean;
  isBonus: boolean;
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
  onPickup: (type: PickupType) => void;
};

const WORLD_W = 300;
const WORLD_HALF_W = 150;
const MAX_THRUST = 300;
const THRUST_DRAG = 0.98;
const ANGULAR_ACCEL = 4.0;
const ANGULAR_DRAG = 0.88;
const FUEL_MAX = 100;
const SAFE_VSPEED = 45;
const SAFE_HSPEED = 25;
const SAFE_ANGLE = 0.30;
const COUNTDOWN_SEC = 3;
const CAMERA_LERP = 5;
const SLOWMO_SCALE = 0.35;
const SLOWMO_DURATION = 4.0;
const PICKUP_RADIUS = 15;
const HS_KEY = 'moon-landing-highscore';
const MAX_PARTICLES = 200;
const THRUSTER_INTERVAL = 0.028;

const THEMES: Record<string, Theme> = {
  moon: {
    name: 'Moon',
    gravity: 80,
    fuelRate: 18,
    skyColor: 0x020408,
    groundColor: 0x3a3a4a,
    groundEdgeColor: 0x8888aa,
    starColor: 0xffffff,
    particleColor: 0xaaddff,
    ambientColor: 0x334466,
    accentColor: 0x6688cc,
    dustColor: 0xccccdd,
  },
  mars: {
    name: 'Mars',
    gravity: 130,
    fuelRate: 16.4,
    skyColor: 0x100504,
    groundColor: 0x6b3020,
    groundEdgeColor: 0xcc6644,
    starColor: 0xffddcc,
    particleColor: 0xff7744,
    ambientColor: 0x663322,
    accentColor: 0xff5522,
    dustColor: 0xdd8866,
  },
  venus: {
    name: 'Venus',
    gravity: 190,
    fuelRate: 14.4,
    skyColor: 0x040d08,
    groundColor: 0x1a4030,
    groundEdgeColor: 0x44cc88,
    starColor: 0xaaffdd,
    particleColor: 0x44ffaa,
    ambientColor: 0x224433,
    accentColor: 0x22ffaa,
    dustColor: 0x88ffcc,
  },
  jupiter: {
    name: 'Jupiter',
    gravity: 260,
    fuelRate: 12.9,
    skyColor: 0x080601,
    groundColor: 0x5a3d10,
    groundEdgeColor: 0xffbb44,
    starColor: 0xffeeaa,
    particleColor: 0xffcc33,
    ambientColor: 0x443310,
    accentColor: 0xffaa22,
    dustColor: 0xffdd88,
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

  const flashLight = new THREE.PointLight(0xffffff, 0, 400);
  scene.add(flashLight);
  let flashIntensity = 0;

  // Star field
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

  // Ship outline
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

  // ---- Particle system (single Points draw call) ----
  const particles: Particle[] = Array.from({ length: MAX_PARTICLES, }, () => ({
    active: false, x: 0, y: 0, vx: 0, vy: 0,
    life: 0, maxLife: 1, drag: 0.95, grav: 0, r: 1, g: 1, b: 1,
  }),);
  const pBuf = new Float32Array(MAX_PARTICLES * 3);
  const cBuf = new Float32Array(MAX_PARTICLES * 3);
  for (let i = 0; i < MAX_PARTICLES; i++) pBuf[i * 3 + 1] = -9999;
  const pGeo = new THREE.BufferGeometry();
  const pPosAttr = new THREE.BufferAttribute(pBuf, 3);
  const pColAttr = new THREE.BufferAttribute(cBuf, 3);
  pPosAttr.setUsage(THREE.DynamicDrawUsage);
  pColAttr.setUsage(THREE.DynamicDrawUsage);
  pGeo.setAttribute('position', pPosAttr);
  pGeo.setAttribute('color', pColAttr);
  const pMat = new THREE.PointsMaterial({ size: 2.5, vertexColors: true, sizeAttenuation: true, });
  const pPoints = new THREE.Points(pGeo, pMat);
  pPoints.position.z = 0.50;
  scene.add(pPoints);

  function emit(
    count: number,
    ox: number, oy: number,
    vx: number, vy: number,
    spread: number,
    color: number,
    life: number,
    drag: number,
    grav: number,
  ) {
    const c = new THREE.Color(color);
    let spawned = 0;
    for (let i = 0; i < MAX_PARTICLES && spawned < count; i++) {
      const p = particles[i];
      if (!p.active) {
        p.active = true;
        p.x = ox + (Math.random() - 0.5) * 6;
        p.y = oy + (Math.random() - 0.5) * 6;
        p.vx = vx + (Math.random() - 0.5) * spread;
        p.vy = vy + (Math.random() - 0.5) * spread;
        p.life = life * (0.6 + Math.random() * 0.8);
        p.maxLife = p.life;
        p.drag = drag;
        p.grav = grav;
        p.r = c.r; p.g = c.g; p.b = c.b;
        spawned++;
      }
    }
  }

  function clearParticles() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      particles[i].active = false;
      pBuf[i * 3 + 1] = -9999;
      cBuf[i * 3] = cBuf[i * 3 + 1] = cBuf[i * 3 + 2] = 0;
    }
    pPosAttr.needsUpdate = true;
    pColAttr.needsUpdate = true;
  }

  // ---- Debris (crash fragments — individual spinning Lines) ----
  let debris: Debris[] = [];

  function clearDebris() {
    for (const d of debris) {
      scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      (d.mesh.material as THREE.Material).dispose();
    }
    debris = [];
  }

  function spawnDebris() {
    const count = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const len = 8 + Math.random() * 12;
      const fAngle = Math.random() * Math.PI * 2;
      const fGeo = new THREE.BufferGeometry();
      fGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        0, 0, 0,
        Math.cos(fAngle) * len, Math.sin(fAngle) * len, 0,
      ]), 3));
      const fMat = new THREE.LineBasicMaterial({ color: theme.accentColor, transparent: true, });
      const fMesh = new THREE.Line(fGeo, fMat);
      fMesh.position.set(shipPos.x, shipPos.y, 0.30);
      scene.add(fMesh);
      const spd = 40 + Math.random() * 60;
      const dir = Math.random() * Math.PI * 2;
      const debrisLife = 1.5 + Math.random() * 0.5;
      debris.push({
        mesh: fMesh,
        vx: Math.cos(dir) * spd,
        vy: Math.sin(dir) * spd,
        angVel: (Math.random() - 0.5) * 8,
        life: debrisLife,
        maxLife: debrisLife,
      });
    }
  }

  function triggerFlash(x: number, y: number, color: number, intensity: number) {
    flashLight.position.set(x, y, 8);
    flashLight.color.setHex(color);
    flashIntensity = intensity;
    flashLight.intensity = intensity;
  }

  // ---- Terrain ----
  let terrainMesh: THREE.Mesh | null = null;
  let edgeMesh: THREE.Line | null = null;
  let padMeshes: THREE.Mesh[] = [];
  let heightmap = new Float32Array(WORLD_W + 1);
  let pads: Pad[] = [];

  // Reusable Color objects for pad pulsing — avoids per-frame GC
  const _padColA = new THREE.Color();
  const _padColB = new THREE.Color();

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

  // ---- Pickups ----
  let pickups: Pickup[] = [];

  function clearPickups() {
    for (const pk of pickups) {
      scene.remove(pk.mesh);
      pk.mesh.geometry.dispose();
      (pk.mesh.material as THREE.Material).dispose();
    }
    pickups = [];
  }

  function collectPickup(pk: Pickup) {
    scene.remove(pk.mesh);
    pk.mesh.geometry.dispose();
    (pk.mesh.material as THREE.Material).dispose();

    const pkColor = pk.type === 'fuel' ? 0xffcc33 : pk.type === 'score' ? 0x44ffff : 0x4488ff;
    emit(14, pk.x, pk.y, 0, 0, 90, pkColor, 0.5, 0.93, 0);
    triggerFlash(pk.x, pk.y, pkColor, 6);

    if (pk.type === 'fuel') {
      fuel = Math.min(FUEL_MAX, fuel + 35);
      cb.onFuel(fuel);
    } else if (pk.type === 'score') {
      scoreMultiplier = Math.min(2.25, scoreMultiplier * 1.5);
    } else if (pk.type === 'slowmo') {
      timeScale = SLOWMO_SCALE;
      slowmoTimer = SLOWMO_DURATION;
    }

    cb.onPickup(pk.type);
  }

  function spawnPickups() {
    clearPickups();
    const count = 2 + Math.floor(Math.random() * 3);
    const types: PickupType[] = ['fuel', 'score', 'slowmo'];

    for (let i = 0; i < count; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const x = -WORLD_HALF_W + 20 + Math.random() * (WORLD_W - 40);
      const xi = Math.max(0, Math.min(WORLD_W, Math.round(x + WORLD_HALF_W)));
      const terrainY = heightmap[xi];
      const y = terrainY + 80 + Math.random() * 250;

      const color = type === 'fuel' ? 0xffcc33 : type === 'score' ? 0x44ffff : 0x4488ff;
      const geo = new THREE.OctahedronGeometry(6, 0);
      const mat = new THREE.MeshBasicMaterial({ color, wireframe: true, });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, 0.20);
      scene.add(mesh);

      pickups.push({ mesh, type, x, y, driftVx: (Math.random() - 0.5) * 12, });
    }
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

    const padWidth = Math.max(30, 60 - (levelNum - 1) * 5);
    const padMargin = 30;
    const padStart = padMargin + Math.floor(rng() * (WORLD_W - padWidth - padMargin * 2));
    const padCenterIdx = padStart + Math.floor(padWidth / 2);
    const padY = heightmap[padCenterIdx];
    for (let i = padStart; i <= Math.min(WORLD_W, padStart + padWidth); i++) {
      heightmap[i] = padY;
    }

    const primaryPad: Pad = {
      xMin: -WORLD_HALF_W + padStart,
      xMax: -WORLD_HALF_W + padStart + padWidth,
      centerY: padY,
      width: padWidth,
      isBonus: false,
    };
    pads = [primaryPad];

    const bonusPadWidth = Math.max(15, 30 - Math.max(0, levelNum - 1) * 2);
    for (let attempt = 0; attempt < 10; attempt++) {
      const bStart = padMargin + Math.floor(rng() * (WORLD_W - bonusPadWidth - padMargin * 2));
      const bEnd = bStart + bonusPadWidth;
      const noOverlap = bEnd < padStart - 10 || bStart > padStart + padWidth + 10;
      if (noOverlap) {
        const bCenterIdx = bStart + Math.floor(bonusPadWidth / 2);
        const bPadY = heightmap[bCenterIdx];
        for (let i = bStart; i <= Math.min(WORLD_W, bEnd); i++) {
          heightmap[i] = bPadY;
        }
        pads.push({
          xMin: -WORLD_HALF_W + bStart,
          xMax: -WORLD_HALF_W + bEnd,
          centerY: bPadY,
          width: bonusPadWidth,
          isBonus: true,
        });
        break;
      }
    }

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

    const edgePts: THREE.Vector3[] = [];
    for (let i = 0; i <= WORLD_W; i++) {
      edgePts.push(new THREE.Vector3(-WORLD_HALF_W + i, heightmap[i], 0.05));
    }
    const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePts);
    const edgeMatObj = new THREE.LineBasicMaterial({ color: t.groundEdgeColor, });
    edgeMesh = new THREE.Line(edgeGeo, edgeMatObj);
    scene.add(edgeMesh);

    padMeshes = [];
    for (const pad of pads) {
      const padGeo = new THREE.PlaneGeometry(pad.width, 5);
      const padColor = pad.isBonus ? 0xffdd44 : 0x44ff44;
      const padMatObj = new THREE.MeshBasicMaterial({ color: padColor, });
      const padMeshObj = new THREE.Mesh(padGeo, padMatObj);
      padMeshObj.position.set((pad.xMin + pad.xMax) / 2, pad.centerY + 2.5, 0.08);
      scene.add(padMeshObj);
      padMeshes.push(padMeshObj);
    }

    return primaryPad;
  }

  // ---- Game state ----
  let phase: Phase = 'countdown';
  let level = 1;
  let score = 0;
  let streak = 0;
  let fuel = FUEL_MAX;
  let countdownTimer = COUNTDOWN_SEC;
  let globalTime = 0;
  let shakeAmt = 0;
  let theme: Theme = THEMES['moon'];
  let timeScale = 1.0;
  let slowmoTimer = 0;
  let windForce = 0;
  let scoreMultiplier = 1.0;
  let highScore = parseInt(localStorage.getItem(HS_KEY) ?? '0', 10);
  let thrusterTimer = 0;

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
    clearDebris();
    clearParticles();
    fuel = FUEL_MAX;
    countdownTimer = COUNTDOWN_SEC;
    phase = 'countdown';
    timeScale = 1.0;
    slowmoTimer = 0;
    scoreMultiplier = 1.0;
    thrusterTimer = 0;
    flashIntensity = 0;
    flashLight.intensity = 0;

    const themeKey = THEME_KEYS[Math.floor(Math.random() * THEME_KEYS.length)];
    applyTheme(THEMES[themeKey]);

    if (level >= 6) {
      const magnitude = Math.min(40, (level - 5) * 8);
      windForce = (Math.random() < 0.5 ? 1 : -1) * magnitude;
    } else {
      windForce = 0;
    }

    const seed = (Math.random() * 0xffffffff) >>> 0;
    const pad = generateTerrain(seed, level, theme);
    spawnPickups();

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
    const isBullseye = dist <= 5;
    const fuelBonus = Math.floor(fuel * 8);
    const tiltBonus = Math.abs(shipAngle) <= 0.05 ? 150 : 0;
    const base = 500;
    const mult = pad.isBonus ? 2 : 1;

    streak++;
    const streakBonus = streak % 3 === 0 ? 500 : 0;

    const landing = (base + speedBonus + accuracyBonus + fuelBonus + tiltBonus) * mult * scoreMultiplier;
    const total = Math.floor(landing) + streakBonus;
    score += total;
    scoreMultiplier = 1.0;

    if (score > highScore) {
      highScore = score;
      localStorage.setItem(HS_KEY, String(highScore));
    }

    // Landing VFX
    shakeAmt = 0.25;
    triggerFlash(shipPos.x, shipPos.y, 0x88ff44, 12);
    emit(40, shipPos.x, shipPos.y - 8, 0, 0, 80, theme.dustColor, 1.2, 0.95, theme.gravity * 0.4);
    emit(12, shipPos.x, shipPos.y - 8, 0, 15, 50, 0xffffff, 0.6, 0.96, 30);

    cb.onScore(score);
    cb.onStreak(streak);
    cb.onPhase(phase);
    cb.onLanded({
      base,
      speed: speedBonus,
      accuracy: accuracyBonus,
      fuel: fuelBonus,
      tilt: tiltBonus,
      streakBonus,
      isBullseye,
      isBonus: pad.isBonus,
      total,
    });
  }

  function doCrash() {
    if (phase !== 'flying') return;
    phase = 'crashed';
    flamMesh.visible = false;
    streak = 0;
    shakeAmt = 0.8;
    scoreMultiplier = 1.0;

    // Crash VFX
    triggerFlash(shipPos.x, shipPos.y, 0xff4400, 25);
    emit(80, shipPos.x, shipPos.y, 0, 10, 120, theme.dustColor, 1.5, 0.94, theme.gravity * 0.3);
    emit(40, shipPos.x, shipPos.y, 0, 35, 100, 0xff4400, 1.2, 0.95, -25);
    emit(20, shipPos.x, shipPos.y, 0, 55, 80, 0xffffff, 0.6, 0.97, 60);
    spawnDebris();

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
    const rawDt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    globalTime += rawDt;

    if (slowmoTimer > 0) {
      slowmoTimer -= rawDt;
      if (slowmoTimer <= 0) {
        slowmoTimer = 0;
        timeScale = 1.0;
      }
    }

    const dt = rawDt;
    const scaledDt = rawDt * timeScale;

    accentAngle += dt * 0.2;
    accentLight.position.set(
      Math.cos(accentAngle) * 500,
      100 + Math.sin(accentAngle * 0.4) * 100,
      8,
    );

    // Flash light decay
    if (flashIntensity > 0.05) {
      flashIntensity *= Math.exp(-12 * dt);
      flashLight.intensity = flashIntensity;
    } else if (flashIntensity !== 0) {
      flashIntensity = 0;
      flashLight.intensity = 0;
    }

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
      fuel = Math.max(0, fuel - effectiveThrust * theme.fuelRate * scaledDt);
      cb.onFuel(fuel);

      const drag = Math.pow(THRUST_DRAG, scaledDt * 60);
      shipVel.x += Math.sin(shipAngle) * effectiveThrust * MAX_THRUST * scaledDt;
      shipVel.y += Math.cos(shipAngle) * effectiveThrust * MAX_THRUST * scaledDt - theme.gravity * scaledDt;
      shipVel.x += windForce * scaledDt;
      shipVel.x *= drag;
      shipVel.y *= drag;

      const angDrag = Math.pow(ANGULAR_DRAG, scaledDt * 60);
      angularVel += tiltIn * ANGULAR_ACCEL * scaledDt;
      angularVel *= angDrag;
      shipAngle += angularVel * scaledDt;

      shipPos.x += shipVel.x * scaledDt;
      shipPos.y += shipVel.y * scaledDt;
      shipPos.x = Math.max(-WORLD_HALF_W + 10, Math.min(WORLD_HALF_W - 10, shipPos.x));

      shipMesh.position.set(shipPos.x, shipPos.y, 0.30);
      shipMesh.rotation.z = -shipAngle;
      flamMesh.position.set(shipPos.x, shipPos.y, 0.32);
      flamMesh.rotation.z = -shipAngle;
      flamMesh.visible = effectiveThrust > 0;

      // shipGlow tracks thrust intensity
      shipGlow.position.set(shipPos.x, shipPos.y, 3);
      shipGlow.intensity = 1.2 + effectiveThrust * 5 + Math.sin(globalTime * 2) * 0.3;

      const thrX = shipPos.x - Math.sin(shipAngle) * 14;
      const thrY = shipPos.y - Math.cos(shipAngle) * 14;
      thrusterGlow.position.set(thrX, thrY, 3);
      thrusterGlow.intensity = effectiveThrust * 8;

      // Thruster particle trail (real-time timer — not scaled so emission stays steady)
      if (effectiveThrust > 0.02) {
        thrusterTimer -= dt;
        if (thrusterTimer <= 0) {
          thrusterTimer = THRUSTER_INTERVAL / Math.max(0.25, effectiveThrust);
          const count = Math.ceil(effectiveThrust * 3);
          const speed = 55 + effectiveThrust * 75;
          emit(
            count, thrX, thrY,
            -Math.sin(shipAngle) * speed, -Math.cos(shipAngle) * speed,
            35,
            theme.particleColor,
            0.3 + effectiveThrust * 0.2,
            0.90, theme.gravity * 0.12,
          );
        }
      } else {
        thrusterTimer = 0;
      }

      // Pad approach pulse
      if (pads.length > 0) {
        const nearestPad = pads.reduce((a, b) =>
          Math.abs(shipPos.x - (a.xMin + a.xMax) / 2) < Math.abs(shipPos.x - (b.xMin + b.xMax) / 2) ? a : b,
        );
        const altVal = Math.max(0, shipPos.y - 8 - nearestPad.centerY);
        const inApproach = altVal < 200;
        const safeLand = Math.abs(shipVel.y) <= SAFE_VSPEED
          && Math.abs(shipVel.x) <= SAFE_HSPEED
          && Math.abs(shipAngle) <= SAFE_ANGLE;
        const pulse = 0.5 + Math.sin(globalTime * 6) * 0.45;

        for (let pi = 0; pi < padMeshes.length; pi++) {
          const pad = pads[pi];
          const mat = padMeshes[pi]?.material as THREE.MeshBasicMaterial | undefined;
          if (!pad || !mat) continue;
          if (pad.isBonus) {
            _padColA.setHex(0xffdd44);
            _padColB.setHex(0xffffff);
            mat.color.copy(_padColA).lerp(_padColB, pulse * 0.35);
          } else if (inApproach) {
            _padColA.setHex(safeLand ? 0x44ff44 : 0xff3333);
            _padColB.setHex(safeLand ? 0xaaffaa : 0xff9999);
            mat.color.copy(_padColA).lerp(_padColB, pulse);
          } else {
            mat.color.setHex(0x44ff44);
          }
        }
      }

      // Pickup spin, drift, and collection
      const toCollect: Pickup[] = [];
      for (const pk of pickups) {
        pk.mesh.rotation.x += rawDt * 1.5;
        pk.mesh.rotation.y += rawDt * 2.0;
        pk.x += pk.driftVx * scaledDt;
        if (pk.x < -WORLD_HALF_W + 10) { pk.x = -WORLD_HALF_W + 10; pk.driftVx = Math.abs(pk.driftVx); }
        if (pk.x > WORLD_HALF_W - 10) { pk.x = WORLD_HALF_W - 10; pk.driftVx = -Math.abs(pk.driftVx); }
        pk.mesh.position.x = pk.x;

        const dx = shipPos.x - pk.x;
        const dy = shipPos.y - pk.y;
        if (dx * dx + dy * dy < PICKUP_RADIUS * PICKUP_RADIUS) {
          toCollect.push(pk);
        }
      }
      for (const pk of toCollect) {
        collectPickup(pk);
        const idx = pickups.indexOf(pk);
        if (idx >= 0) pickups.splice(idx, 1);
      }

      checkCollision();
    }

    // Update particles
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = particles[i];
      if (!p.active) continue;
      p.life -= scaledDt;
      if (p.life <= 0) {
        p.active = false;
        pBuf[i * 3 + 1] = -9999;
        cBuf[i * 3] = cBuf[i * 3 + 1] = cBuf[i * 3 + 2] = 0;
      } else {
        const dg = Math.pow(p.drag, scaledDt * 60);
        p.vx *= dg; p.vy *= dg;
        p.vy += p.grav * scaledDt;
        p.x += p.vx * scaledDt;
        p.y += p.vy * scaledDt;
        const fade = p.life / p.maxLife;
        pBuf[i * 3] = p.x;
        pBuf[i * 3 + 1] = p.y;
        pBuf[i * 3 + 2] = 0.50;
        cBuf[i * 3] = p.r * fade;
        cBuf[i * 3 + 1] = p.g * fade;
        cBuf[i * 3 + 2] = p.b * fade;
      }
    }
    pPosAttr.needsUpdate = true;
    pColAttr.needsUpdate = true;

    // Update debris
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.life -= scaledDt;
      if (d.life <= 0) {
        scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        (d.mesh.material as THREE.Material).dispose();
        debris.splice(i, 1);
      } else {
        const dg = Math.pow(0.97, scaledDt * 60);
        d.vx *= dg; d.vy *= dg;
        d.vy += theme.gravity * 0.5 * scaledDt;
        d.mesh.position.x += d.vx * scaledDt;
        d.mesh.position.y += d.vy * scaledDt;
        d.mesh.rotation.z += d.angVel * scaledDt;
        (d.mesh.material as THREE.LineBasicMaterial).opacity = d.life / d.maxLife;
      }
    }

    // Camera soft follow
    if (phase === 'countdown' || phase === 'flying') {
      const targetCamY = Math.max(shipPos.y, visibleHalfH + 10);
      const lerp = 1 - Math.exp(-CAMERA_LERP * dt);
      camera.position.y += (targetCamY - camera.position.y) * lerp;
    }

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
    get velX() { return shipVel.x; },
    get velY() { return shipVel.y; },
    get shipAngle() { return shipAngle; },
    get altToPad() {
      if (pads.length === 0) return 9999;
      const best = pads.reduce((a, b) =>
        Math.abs(shipPos.x - (a.xMin + a.xMax) / 2) < Math.abs(shipPos.x - (b.xMin + b.xMax) / 2) ? a : b,
      );
      return Math.max(0, shipPos.y - 8 - best.centerY);
    },
    get windForce() { return windForce; },
    get timeScale() { return timeScale; },
    get highScore() { return highScore; },
    restart() {
      level = 1;
      score = 0;
      streak = 0;
      shakeAmt = 0;
      timeScale = 1.0;
      slowmoTimer = 0;
      scoreMultiplier = 1.0;
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
      clearParticles();
      clearDebris();
      clearPickups();
      disposeTerrainMesh();
      scene.remove(shipMesh, flamMesh, stars, pPoints);
      shipGeo.dispose();
      shipMat.dispose();
      flamGeo.dispose();
      flamMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      pGeo.dispose();
      pMat.dispose();
      renderer.dispose();
    },
  };
}
