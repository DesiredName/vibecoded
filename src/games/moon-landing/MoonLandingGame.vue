<template>
  <div class="relative w-full h-full">
    <canvas
      ref="canvasRef"
      class="absolute inset-0 w-full h-full block"
    />

    <!-- HUD pill -->
    <div class="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-gray-900/80 backdrop-blur-sm border border-gray-700/60 rounded-full px-6 py-2 text-sm font-mono pointer-events-none select-none">
      <span class="text-gray-500 text-xs uppercase tracking-widest">Level <span class="text-blue-400 font-bold">{{ level }}</span></span>
      <span class="text-gray-600">|</span>
      <span>Score: <span class="text-cyan-400 font-bold">{{ score }}</span></span>
      <span class="text-gray-600">|</span>
      <span class="flex items-center gap-1.5">
        <span class="text-gray-400 text-xs">FUEL</span>
        <div class="w-20 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-100"
            :class="fuel > 25 ? 'bg-green-500' : fuel > 10 ? 'bg-orange-500' : 'bg-red-500'"
            :style="{ width: `${fuel}%` }"
          />
        </div>
      </span>
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

    <!-- LANDED overlay -->
    <Transition name="overlay">
      <div
        v-if="phase === 'landed'"
        class="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/70 backdrop-blur-sm"
      >
        <p class="text-5xl font-black text-green-400 tracking-wide mb-3">LANDED!</p>
        <p class="text-2xl text-gray-300 mb-8">+{{ lastBreakdown?.total ?? 0 }} pts</p>
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
        <p class="text-5xl font-black text-red-500 tracking-wide mb-3">CRASH</p>
        <p class="text-gray-400 text-lg mb-8">Score: <span class="text-cyan-400 font-bold">{{ score }}</span></p>
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
import { ref, computed, onMounted, onUnmounted, } from 'vue';
import { createMoonLandingGame, } from './game.ts';
import type { Phase, ScoreBreakdown, } from './game.ts';

const canvasRef = ref<HTMLCanvasElement | null>(null,);
const score = ref(0,);
const level = ref(1,);
const fuel = ref(100,);
const streak = ref(0,);
const phase = ref<Phase>('countdown',);
const themeName = ref('',);
const lastBreakdown = ref<ScoreBreakdown | null>(null,);
const countdownRaw = ref(3,);

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

let game: ReturnType<typeof createMoonLandingGame> | null = null;
let rafHud: number | null = null;

function pollHud() {
  if (game && phase.value === 'countdown') {
    countdownRaw.value = game.countdownTimer;
  }
  rafHud = requestAnimationFrame(pollHud,);
}

function nextLevel() {
  lastBreakdown.value = null;
  game?.nextLevel();
}

function restart() {
  score.value = 0;
  level.value = 1;
  fuel.value = 100;
  streak.value = 0;
  lastBreakdown.value = null;
  game?.restart();
}

onMounted(() => {
  if (!canvasRef.value) return;
  game = createMoonLandingGame(canvasRef.value, {
    onScore: (s,) => { score.value = s; },
    onLevel: (l,) => { level.value = l; },
    onFuel: (f,) => { fuel.value = f; },
    onStreak: (s,) => { streak.value = s; },
    onPhase: (p,) => { phase.value = p; },
    onLanded: (bd,) => { lastBreakdown.value = bd; },
    onGameOver: () => {},
    onTheme: (name,) => { themeName.value = name; },
  },);
  rafHud = requestAnimationFrame(pollHud,);
},);

onUnmounted(() => {
  if (rafHud !== null) cancelAnimationFrame(rafHud,);
  game?.destroy();
},);
</script>

<style scoped>
.overlay-enter-active,
.overlay-leave-active { transition: opacity 0.3s ease; }
.overlay-enter-from,
.overlay-leave-to { opacity: 0; }
</style>
