<template>
  <div class="relative w-full h-full">
    <canvas
      ref="canvasRef"
      class="absolute inset-0 w-full h-full block"
    />

    <!-- Slowmo blue tint overlay -->
    <div
      v-if="isSlowmo"
      class="absolute inset-0 pointer-events-none"
      style="background: rgba(20,60,120,0.14);"
    />

    <!-- Speed danger vignette -->
    <div
      v-if="speedDanger"
      class="absolute inset-0 pointer-events-none speed-danger-vignette"
    />

    <!-- HUD pill -->
    <div
      class="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-gray-900/80 backdrop-blur-sm border border-gray-700/60 rounded-full px-6 py-2 text-sm font-mono pointer-events-none select-none transition-all duration-300"
      :style="isSlowmo ? { filter: 'blur(0.6px)', opacity: '0.85' } : {}"
    >
      <span class="text-gray-500 text-xs uppercase tracking-widest">Level <span class="text-blue-400 font-bold">{{ level }}</span></span>
      <span class="text-gray-600">|</span>
      <span>Score: <span class="text-cyan-400 font-bold">{{ score }}</span></span>
      <span class="text-gray-600">|</span>
      <span class="flex items-center gap-1.5">
        <span
          class="text-gray-400 text-xs"
          :class="fuel <= 10 ? 'fuel-flicker-fast' : fuel <= 25 ? 'fuel-flicker' : ''"
        >FUEL</span>
        <div class="w-20 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-100"
            :class="[
              fuel > 25 ? 'bg-green-500' : fuel > 10 ? 'bg-orange-500' : 'bg-red-500',
              fuel <= 10 ? 'fuel-flicker-fast' : fuel <= 25 ? 'fuel-flicker' : '',
            ]"
            :style="{ width: `${fuel}%` }"
          />
        </div>
      </span>
      <template v-if="streak > 0">
        <span class="text-gray-600">|</span>
        <span class="text-yellow-400 font-bold text-xs tracking-wide">STREAK ×{{ streak }}</span>
      </template>
      <template v-if="windArrow">
        <span class="text-gray-600">|</span>
        <span class="text-amber-400 font-bold text-xs tracking-wide">WIND {{ windArrow.dir }} {{ windArrow.mag }}</span>
      </template>
    </div>

    <!-- Speed / angle readout panel -->
    <Transition name="overlay">
      <div
        v-if="phase === 'flying'"
        class="absolute top-16 right-4 flex flex-col gap-1 bg-gray-900/75 backdrop-blur-sm border border-gray-700/50 rounded-xl px-4 py-3 font-mono text-xs pointer-events-none select-none"
      >
        <div class="flex items-center justify-between gap-4">
          <span class="text-gray-500">↕ V-SPD</span>
          <span :class="safeV ? 'text-green-400' : 'text-red-400'" class="font-bold tabular-nums">
            {{ vSpeedDisplay }}
          </span>
        </div>
        <div class="flex items-center justify-between gap-4">
          <span class="text-gray-500">↔ H-SPD</span>
          <span :class="safeH ? 'text-green-400' : 'text-red-400'" class="font-bold tabular-nums">
            {{ Math.abs(hSpeed).toFixed(1) }}
          </span>
        </div>
        <div class="flex items-center justify-between gap-4">
          <span class="text-gray-500">↻ ANGLE</span>
          <span :class="safeA ? 'text-green-400' : 'text-red-400'" class="font-bold tabular-nums">
            {{ tiltDeg.toFixed(1) }}°
          </span>
        </div>
      </div>
    </Transition>

    <!-- SAFE TO LAND badge -->
    <Transition name="overlay">
      <div
        v-if="showApproach"
        class="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest font-mono pointer-events-none select-none border"
        :class="safeToLand
          ? 'bg-green-900/60 border-green-500/60 text-green-300'
          : 'bg-red-900/50 border-red-500/50 text-red-400'"
      >
        {{ safeToLand ? '✓ SAFE TO LAND' : '✗ TOO FAST / TILTED' }}
      </div>
    </Transition>

    <!-- Pickup notification -->
    <Transition name="overlay">
      <div
        v-if="pickupNotification"
        class="absolute top-32 left-1/2 -translate-x-1/2 px-5 py-2 rounded-full font-mono font-bold text-sm tracking-widest pointer-events-none select-none border"
        :class="pickupNotifClass"
      >
        {{ pickupNotification }}
      </div>
    </Transition>

    <!-- Left Thrust Slider -->
    <div
      ref="thrustSliderRef"
      class="absolute left-0 top-0 bottom-0 w-17.5 select-none touch-none"
    >
      <div class="absolute inset-x-0 top-10 bottom-10 flex justify-center">
        <div class="relative w-8 h-full rounded-full bg-white/5 border border-white/10 overflow-visible">
          <!-- Fill -->
          <div
            class="absolute bottom-0 left-0 right-0 rounded-full pointer-events-none transition-all duration-75"
            :style="thrustFillStyle"
          />
          <!-- Thumb -->
          <div
            class="absolute left-1/2 w-10 h-10 rounded-full pointer-events-none flex items-center justify-center"
            :style="thrustThumbStyle"
          >
            <div
              class="w-3 h-3 rounded-full"
              :style="{ background: thrustThumbColor, opacity: 0.35 + thrustValue * 0.65 }"
            />
          </div>
        </div>
      </div>
      <div class="absolute bottom-3 left-1/2 -translate-x-1/2 text-[9px] text-gray-600 tracking-widest font-mono pointer-events-none">
        THRUST
      </div>
    </div>

    <!-- Right Tilt Slider -->
    <div
      ref="tiltSliderRef"
      class="absolute right-0 top-0 bottom-0 w-17.5 select-none touch-none"
    >
      <div class="absolute inset-x-0 top-10 bottom-10 flex justify-center">
        <div class="relative w-8 h-full rounded-full bg-white/5 border border-white/10 overflow-visible">
          <!-- Center notch -->
          <div class="absolute left-0 right-0 h-px bg-white/25 pointer-events-none" style="top: 50%;" />
          <!-- Thumb -->
          <div
            class="absolute left-1/2 w-10 h-10 rounded-full pointer-events-none flex items-center justify-center text-blue-400 text-xs font-bold"
            :style="tiltThumbStyle"
          >
            {{ tiltValue < -0.1 ? '◄' : tiltValue > 0.1 ? '►' : '◆' }}
          </div>
        </div>
      </div>
      <div class="absolute bottom-3 left-1/2 -translate-x-1/2 text-[9px] text-gray-600 tracking-widest font-mono pointer-events-none">
        TILT
      </div>
    </div>

    <!-- Countdown overlay -->
    <Transition name="overlay">
      <div
        v-if="phase === 'countdown'"
        class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none"
      >
        <p class="text-2xl font-bold text-gray-400 tracking-widest uppercase mb-6">{{ themeName }}</p>
        <p class="text-9xl font-black tabular-nums" :class="countdownColor">{{ countdownDisplay }}</p>
      </div>
    </Transition>

    <!-- GO! overlay -->
    <Transition name="overlay">
      <div
        v-if="showGo"
        class="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
      >
        <p class="text-9xl font-black text-green-400">GO!</p>
      </div>
    </Transition>

    <!-- LANDED overlay -->
    <Transition name="overlay">
      <div
        v-if="phase === 'landed'"
        class="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/70 backdrop-blur-sm"
      >
        <p class="text-5xl font-black text-green-400 tracking-wide mb-1">LANDED!</p>
        <p v-if="isPerfect" class="text-sm text-yellow-400 font-bold tracking-widest mb-1">★ PERFECT LANDING ★</p>
        <p v-else-if="isBullseye" class="text-sm text-cyan-400 font-bold tracking-widest mb-1">◎ BULLSEYE</p>
        <p v-else class="mb-1" />
        <p v-if="isOnBonusPad" class="text-xs text-amber-400 font-bold tracking-wider mb-3">BONUS PAD ×2</p>
        <div v-else class="mb-3" />

        <!-- Score breakdown lines, animated in sequentially -->
        <div class="flex flex-col items-end gap-1 mb-4 font-mono text-sm min-w-45">
          <div
            v-for="(line, i) in breakdownLines"
            :key="line.label"
            class="flex justify-between w-full gap-6"
            style="transition: opacity 0.3s ease, transform 0.35s ease;"
            :style="i < visibleLineCount
              ? { opacity: '1', transform: 'translateY(0)' }
              : { opacity: '0', transform: 'translateY(14px)' }"
          >
            <span class="text-gray-500">{{ line.label }}</span>
            <span class="text-cyan-300 font-bold">+{{ line.value }}</span>
          </div>
          <div class="w-full h-px bg-gray-700 my-1" />
          <div
            class="flex justify-between w-full gap-6"
            style="transition: opacity 0.3s ease, transform 0.35s ease;"
            :style="visibleLineCount >= breakdownLines.length
              ? { opacity: '1', transform: 'translateY(0)' }
              : { opacity: '0', transform: 'translateY(14px)' }"
          >
            <span class="text-gray-400 font-bold">TOTAL</span>
            <span class="text-green-400 font-bold text-base">{{ lastBreakdown?.total ?? 0 }}</span>
          </div>
        </div>

        <button
          class="px-8 py-3 bg-green-500 hover:bg-green-400 active:bg-green-600 text-gray-950 font-bold rounded-xl transition-colors text-base tracking-wide"
          @click="nextLevel"
        >
          Next Level
        </button>
      </div>
    </Transition>

    <!-- CRASH overlay -->
    <Transition name="overlay">
      <div
        v-if="phase === 'crashed'"
        class="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/80 backdrop-blur-sm"
      >
        <p class="text-5xl font-black text-red-500 tracking-wide mb-2">CRASH</p>
        <p class="text-gray-400 text-lg mb-1">Score: <span class="text-cyan-400 font-bold">{{ score }}</span></p>
        <p v-if="highScore > 0" class="text-gray-500 text-sm mb-8">Best: <span class="text-amber-400 font-bold">{{ highScore }}</span></p>
        <div v-else class="mb-8" />
        <button
          class="px-8 py-3 bg-red-500 hover:bg-red-400 active:bg-red-600 text-white font-bold rounded-xl transition-colors text-base tracking-wide"
          @click="restart"
        >
          Try Again
        </button>
      </div>
    </Transition>

    <!-- Desktop controls hint -->
    <div class="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs text-gray-700 pointer-events-none select-none hidden sm:block">
      W thrust &nbsp;|&nbsp; A / D tilt
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, } from 'vue';
import { createMoonLandingGame, } from './game.ts';
import type { Phase, ScoreBreakdown, PickupType, } from './game.ts';

const canvasRef = ref<HTMLCanvasElement | null>(null,);
const score = ref(0,);
const level = ref(1,);
const fuel = ref(100,);
const streak = ref(0,);
const phase = ref<Phase>('countdown',);
const themeName = ref('',);
const lastBreakdown = ref<ScoreBreakdown | null>(null,);
const countdownRaw = ref(3,);
const highScore = ref(parseInt(localStorage.getItem('moon-landing-highscore') ?? '0', 10),);

// Flight telemetry (polled each rAF when flying)
const vSpeed = ref(0,);
const hSpeed = ref(0,);
const tiltDeg = ref(0,);
const altToPad = ref(9999,);
const windForceVal = ref(0,);
const isSlowmo = ref(false,);

// Overlays
const showGo = ref(false,);

// Pickup notification
const pickupNotification = ref<string | null>(null,);
const pickupNotifClass = ref('',);
let pickupNotifTimer: ReturnType<typeof setTimeout> | null = null;

// Score breakdown animation
const visibleLineCount = ref(0,);
const breakdownTimers: ReturnType<typeof setTimeout>[] = [];

// Slider state
const thrustSliderRef = ref<HTMLElement | null>(null,);
const tiltSliderRef = ref<HTMLElement | null>(null,);
const thrustValue = ref(0,);
const tiltValue = ref(0,);
const tiltReleasing = ref(false,);
let thrustTouchId: number | null = null;
let tiltTouchId: number | null = null;

// --- Countdown ---

const countdownDisplay = computed(() => {
  const v = Math.ceil(countdownRaw.value,);
  return v >= 1 ? String(v,) : '1';
},);

const countdownColor = computed(() => {
  const v = Math.ceil(countdownRaw.value,);
  if (v >= 3) return 'text-white';
  if (v >= 2) return 'text-yellow-300';
  return 'text-green-400';
},);

// Show "GO!" briefly when countdown ends
watch(phase, (newVal, oldVal,) => {
  if (oldVal === 'countdown' && newVal === 'flying') {
    showGo.value = true;
    setTimeout(() => { showGo.value = false; }, 600,);
  }
},);

// --- Flight telemetry ---

const safeV = computed(() => Math.abs(vSpeed.value,) <= 45,);
const safeH = computed(() => Math.abs(hSpeed.value,) <= 25,);
const safeA = computed(() => Math.abs(tiltDeg.value,) <= 17.19,);
const safeToLand = computed(() => safeV.value && safeH.value && safeA.value,);
const showApproach = computed(() => phase.value === 'flying' && altToPad.value < 200,);

const vSpeedDisplay = computed(() => {
  const v = vSpeed.value;
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(1,)}`;
},);

const speedDanger = computed(() =>
  phase.value === 'flying' && altToPad.value < 120 && Math.abs(vSpeed.value) > 45,
);

const windArrow = computed(() => {
  const f = windForceVal.value;
  if (Math.abs(f,) < 2) return null;
  return { dir: f > 0 ? '→' : '←', mag: Math.abs(f,).toFixed(0,), };
},);

// --- Score breakdown ---

const breakdownLines = computed(() => {
  const bd = lastBreakdown.value;
  if (!bd) return [];
  return [
    { label: 'BASE', value: bd.base, },
    { label: 'SPEED', value: bd.speed, },
    { label: 'ACCURACY', value: bd.accuracy, },
    { label: 'FUEL', value: bd.fuel, },
    { label: 'TILT', value: bd.tilt, },
    { label: 'STREAK BONUS', value: bd.streakBonus, },
  ].filter(l => l.value > 0,);
},);

const isPerfect = computed(() => {
  const bd = lastBreakdown.value;
  return bd ? bd.speed >= 200 && bd.accuracy >= 300 && bd.tilt >= 150 : false;
},);

const isBullseye = computed(() => lastBreakdown.value?.isBullseye ?? false,);
const isOnBonusPad = computed(() => lastBreakdown.value?.isBonus ?? false,);

function animateBreakdown(totalLines: number) {
  for (const t of breakdownTimers) clearTimeout(t,);
  breakdownTimers.length = 0;
  visibleLineCount.value = 0;
  let i = 0;
  const step = () => {
    visibleLineCount.value = ++i;
    if (i <= totalLines) {
      breakdownTimers.push(setTimeout(step, 300,),);
    }
  };
  breakdownTimers.push(setTimeout(step, 200,),);
}

// --- Thrust slider visuals ---

const thrustThumbColor = computed(() => {
  const t = thrustValue.value;
  if (t > 0.7) return '#ffaa22';
  if (t > 0.3) return '#ffdd55';
  return '#667788';
},);

const thrustFillStyle = computed(() => {
  const t = thrustValue.value;
  const gradient =
    t > 0.7
      ? 'linear-gradient(to top, rgba(200,80,0,0.25), rgba(255,180,40,0.55))'
      : t > 0.3
        ? 'linear-gradient(to top, rgba(150,80,0,0.15), rgba(255,200,50,0.35))'
        : 'linear-gradient(to top, rgba(80,80,100,0.1), rgba(100,120,140,0.2))';
  return { height: `${t * 100}%`, background: gradient, };
},);

const thrustThumbStyle = computed(() => {
  const t = thrustValue.value;
  const color = thrustThumbColor.value;
  return {
    top: `${(1 - t) * 100}%`,
    transform: 'translate(-50%, -50%)',
    background: 'rgba(12,14,22,0.95)',
    border: `2px solid ${color}`,
    boxShadow: t > 0.05 ? `0 0 ${8 + t * 16}px ${color}88` : 'none',
  };
},);

const tiltThumbStyle = computed(() => ({
  top: `${(1 - (tiltValue.value + 1) / 2) * 100}%`,
  transform: 'translate(-50%, -50%)',
  background: 'rgba(12,14,22,0.95)',
  border: '2px solid rgba(96,165,250,0.65)',
  boxShadow: Math.abs(tiltValue.value,) > 0.1 ? '0 0 10px rgba(96,165,250,0.4)' : 'none',
  transition: tiltReleasing.value ? 'top 150ms ease-out' : 'none',
}),);

// --- Game instance ---

let game: ReturnType<typeof createMoonLandingGame> | null = null;
let rafHud: number | null = null;

function pollHud() {
  if (game) {
    if (phase.value === 'countdown') {
      countdownRaw.value = game.countdownTimer;
    } else if (phase.value === 'flying') {
      vSpeed.value = game.velY;
      hSpeed.value = game.velX;
      tiltDeg.value = (game.shipAngle * 180) / Math.PI;
      altToPad.value = game.altToPad;
      windForceVal.value = game.windForce;
      isSlowmo.value = game.timeScale < 1;
    }
    highScore.value = game.highScore;
  }
  rafHud = requestAnimationFrame(pollHud,);
}

function resetSliders() {
  thrustValue.value = 0;
  tiltValue.value = 0;
  thrustTouchId = null;
  tiltTouchId = null;
  if (game) {
    game.controls.thrust = 0;
    game.controls.tilt = 0;
  }
}

function nextLevel() {
  lastBreakdown.value = null;
  isSlowmo.value = false;
  windForceVal.value = 0;
  resetSliders();
  game?.nextLevel();
}

function restart() {
  score.value = 0;
  level.value = 1;
  fuel.value = 100;
  streak.value = 0;
  lastBreakdown.value = null;
  isSlowmo.value = false;
  windForceVal.value = 0;
  resetSliders();
  game?.restart();
}

function showPickupNotif(type: PickupType) {
  const labels: Record<PickupType, string> = {
    fuel: 'FUEL +35',
    score: 'SCORE ×1.5',
    slowmo: 'SLOW MO',
  };
  const classes: Record<PickupType, string> = {
    fuel: 'bg-amber-900/80 border-amber-500/60 text-amber-300',
    score: 'bg-cyan-900/80 border-cyan-500/60 text-cyan-300',
    slowmo: 'bg-blue-900/80 border-blue-500/60 text-blue-300',
  };
  pickupNotification.value = labels[type];
  pickupNotifClass.value = classes[type];
  if (pickupNotifTimer) clearTimeout(pickupNotifTimer,);
  pickupNotifTimer = setTimeout(() => { pickupNotification.value = null; }, 1500,);
}

// --- Thrust touch handlers ---

function onThrustStart(e: TouchEvent) {
  e.preventDefault();
  if (thrustTouchId !== null) return;
  const touch = e.changedTouches[0];
  thrustTouchId = touch.identifier;
  applyThrust(touch.clientY,);
}

function onThrustMove(e: TouchEvent) {
  e.preventDefault();
  for (const touch of Array.from(e.changedTouches,)) {
    if (touch.identifier === thrustTouchId) {
      applyThrust(touch.clientY,);
      break;
    }
  }
}

function onThrustEnd(e: TouchEvent) {
  e.preventDefault();
  for (const touch of Array.from(e.changedTouches,)) {
    if (touch.identifier === thrustTouchId) {
      thrustTouchId = null;
      break;
    }
  }
}

function applyThrust(clientY: number) {
  const rect = thrustSliderRef.value?.getBoundingClientRect();
  if (!rect) return;
  const clamped = Math.max(rect.top, Math.min(rect.bottom, clientY,),);
  thrustValue.value = Math.max(0, Math.min(1, 1 - (clamped - rect.top) / rect.height,),);
  if (game) game.controls.thrust = thrustValue.value;
}

// --- Tilt touch handlers ---

function onTiltStart(e: TouchEvent) {
  e.preventDefault();
  if (tiltTouchId !== null) return;
  const touch = e.changedTouches[0];
  tiltTouchId = touch.identifier;
  tiltReleasing.value = false;
  applyTilt(touch.clientY,);
}

function onTiltMove(e: TouchEvent) {
  e.preventDefault();
  for (const touch of Array.from(e.changedTouches,)) {
    if (touch.identifier === tiltTouchId) {
      applyTilt(touch.clientY,);
      break;
    }
  }
}

function onTiltEnd(e: TouchEvent) {
  e.preventDefault();
  for (const touch of Array.from(e.changedTouches,)) {
    if (touch.identifier === tiltTouchId) {
      tiltTouchId = null;
      tiltReleasing.value = true;
      tiltValue.value = 0;
      if (game) game.controls.tilt = 0;
      break;
    }
  }
}

function applyTilt(clientY: number) {
  const rect = tiltSliderRef.value?.getBoundingClientRect();
  if (!rect) return;
  const clamped = Math.max(rect.top, Math.min(rect.bottom, clientY,),);
  const normalized = 1 - (clamped - rect.top) / rect.height;
  tiltValue.value = Math.max(-1, Math.min(1, normalized * 2 - 1,),);
  if (game) game.controls.tilt = tiltValue.value;
}

onMounted(() => {
  if (!canvasRef.value) return;
  game = createMoonLandingGame(canvasRef.value, {
    onScore: (s,) => { score.value = s; },
    onLevel: (l,) => { level.value = l; },
    onFuel: (f,) => { fuel.value = f; },
    onStreak: (s,) => { streak.value = s; },
    onPhase: (p,) => { phase.value = p; },
    onLanded: (bd,) => {
      lastBreakdown.value = bd;
      const count = [bd.base > 0, bd.speed > 0, bd.accuracy > 0, bd.fuel > 0, bd.tilt > 0, bd.streakBonus > 0].filter(Boolean,).length;
      animateBreakdown(count,);
    },
    onGameOver: () => {},
    onTheme: (name,) => { themeName.value = name; },
    onPickup: (type,) => { showPickupNotif(type,); },
  },);
  rafHud = requestAnimationFrame(pollHud,);

  const thrustEl = thrustSliderRef.value;
  if (thrustEl) {
    thrustEl.addEventListener('touchstart', onThrustStart, { passive: false, },);
    thrustEl.addEventListener('touchmove', onThrustMove, { passive: false, },);
    thrustEl.addEventListener('touchend', onThrustEnd, { passive: false, },);
    thrustEl.addEventListener('touchcancel', onThrustEnd, { passive: false, },);
  }

  const tiltEl = tiltSliderRef.value;
  if (tiltEl) {
    tiltEl.addEventListener('touchstart', onTiltStart, { passive: false, },);
    tiltEl.addEventListener('touchmove', onTiltMove, { passive: false, },);
    tiltEl.addEventListener('touchend', onTiltEnd, { passive: false, },);
    tiltEl.addEventListener('touchcancel', onTiltEnd, { passive: false, },);
  }
},);

onUnmounted(() => {
  if (rafHud !== null) cancelAnimationFrame(rafHud,);
  if (pickupNotifTimer !== null) clearTimeout(pickupNotifTimer,);
  for (const t of breakdownTimers) clearTimeout(t,);
  game?.destroy();

  const thrustEl = thrustSliderRef.value;
  if (thrustEl) {
    thrustEl.removeEventListener('touchstart', onThrustStart,);
    thrustEl.removeEventListener('touchmove', onThrustMove,);
    thrustEl.removeEventListener('touchend', onThrustEnd,);
    thrustEl.removeEventListener('touchcancel', onThrustEnd,);
  }

  const tiltEl = tiltSliderRef.value;
  if (tiltEl) {
    tiltEl.removeEventListener('touchstart', onTiltStart,);
    tiltEl.removeEventListener('touchmove', onTiltMove,);
    tiltEl.removeEventListener('touchend', onTiltEnd,);
    tiltEl.removeEventListener('touchcancel', onTiltEnd,);
  }
},);
</script>

<style scoped>
.overlay-enter-active,
.overlay-leave-active { transition: opacity 0.3s ease; }
.overlay-enter-from,
.overlay-leave-to { opacity: 0; }

@keyframes fuel-flicker {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
@keyframes fuel-flicker-fast {
  0%, 100% { opacity: 1; }
  30% { opacity: 0.2; }
  60% { opacity: 0.85; }
}
.fuel-flicker { animation: fuel-flicker 0.7s ease-in-out infinite; }
.fuel-flicker-fast { animation: fuel-flicker-fast 0.25s ease-in-out infinite; }

@keyframes speed-danger-pulse {
  0%, 100% { box-shadow: inset 0 0 60px rgba(255, 30, 30, 0.0); }
  50% { box-shadow: inset 0 0 80px rgba(255, 30, 30, 0.55); }
}
.speed-danger-vignette { animation: speed-danger-pulse 0.4s ease-in-out infinite; }
</style>
