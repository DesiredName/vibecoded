<template>
  <div class="relative w-full h-full">
    <canvas
      ref="canvasRef"
      class="absolute inset-0 w-full h-full block"
    />

    <!-- HUD -->
    <div class="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-6 bg-gray-900/80 backdrop-blur-sm border border-gray-700/60 rounded-full px-6 py-2 text-sm font-mono pointer-events-none select-none">
      <span>Score: <span class="text-blue-400 font-bold">{{ score }}</span></span>
      <span class="text-gray-600">|</span>
      <span class="flex gap-1">
        <span
          v-for="i in 3"
          :key="i"
          :class="i <= lives ? 'text-red-400' : 'text-gray-700'"
        >♥</span>
      </span>
    </div>

    <!-- Combo banner -->
    <Transition name="combo">
      <div
        v-if="comboLabel"
        class="absolute top-16 left-1/2 -translate-x-1/2 pointer-events-none select-none text-center"
      >
        <span
          class="font-black tracking-widest text-lg px-4 py-1 rounded-full"
          :class="comboClass"
        >{{ comboLabel }}</span>
      </div>
    </Transition>

    <!-- Power-up banner -->
    <Transition name="powerup">
      <div
        v-if="powerUpLabel"
        class="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none select-none text-center"
      >
        <span
          class="font-black tracking-widest text-base px-5 py-1.5 rounded-full border"
          :class="powerUpClass"
        >{{ powerUpLabel }}</span>
      </div>
    </Transition>

    <!-- Launch hint -->
    <Transition name="fade">
      <div
        v-if="waiting && !gameOver && !won"
        class="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs text-gray-500 pointer-events-none select-none text-center whitespace-nowrap"
      >
        <span class="hidden sm:inline">Move mouse · Click or Space to launch</span>
        <span class="sm:hidden">Drag to move · Tap to launch</span>
      </div>
    </Transition>

    <!-- Controls hint (while playing, desktop only) -->
    <div
      v-if="!waiting && !gameOver && !won"
      class="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs text-gray-700 pointer-events-none select-none hidden sm:block"
    >
      ← → or A D to move
    </div>

    <!-- Game Over overlay -->
    <Transition name="overlay">
      <div
        v-if="gameOver"
        class="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/80 backdrop-blur-sm"
      >
        <p class="text-5xl font-black text-white tracking-tight mb-1">
          Game Over
        </p>
        <p class="text-gray-400 text-lg mb-8">
          Score: <span class="text-blue-400 font-bold">{{ score }}</span>
        </p>
        <button
          class="px-8 py-3 bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-gray-950 font-bold rounded-xl transition-colors text-base tracking-wide"
          @click="restart"
        >
          Play Again
        </button>
      </div>
    </Transition>

    <!-- Win overlay -->
    <Transition name="overlay">
      <div
        v-if="won"
        class="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/80 backdrop-blur-sm"
      >
        <p class="text-5xl font-black text-yellow-400 tracking-tight mb-1">
          You Win!
        </p>
        <p class="text-gray-400 text-lg mb-8">
          Score: <span class="text-blue-400 font-bold">{{ score }}</span>
        </p>
        <button
          class="px-8 py-3 bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 text-gray-950 font-bold rounded-xl transition-colors text-base tracking-wide"
          @click="restart"
        >
          Play Again
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, } from 'vue';
import { createBreakoutGame, } from './game.ts';

const canvasRef = ref<HTMLCanvasElement | null>(null,);
const score = ref(0,);
const lives = ref(3,);
const gameOver = ref(false,);
const won = ref(false,);
const waiting = ref(true,);
const combo = ref(0,);
const powerUpLabel = ref('',);

let game: ReturnType<typeof createBreakoutGame> | null = null;
let powerUpTimer: ReturnType<typeof setTimeout> | null = null;

const comboLabel = computed(() => {
  if (combo.value >= 8) return '5× COMBO!';
  if (combo.value >= 5) return '3× COMBO!';
  if (combo.value >= 3) return '2× COMBO!';
  return '';
},);

const comboClass = computed(() => {
  if (combo.value >= 8) return 'text-pink-400 bg-pink-950/80 border border-pink-500/50';
  if (combo.value >= 5) return 'text-orange-400 bg-orange-950/80 border border-orange-500/50';
  return 'text-yellow-400 bg-yellow-950/80 border border-yellow-600/50';
},);

const powerUpClass = computed(() => {
  if (powerUpLabel.value === 'FIREBALL') return 'text-orange-400 bg-orange-950/80 border-orange-500/50';
  if (powerUpLabel.value === 'MULTI-BALL') return 'text-green-400 bg-green-950/80 border-green-500/50';
  return 'text-blue-400 bg-blue-950/80 border-blue-500/50';
},);

function showPowerUp(label: string,) {
  if (powerUpTimer !== null) clearTimeout(powerUpTimer,);
  powerUpLabel.value = label;
  powerUpTimer = setTimeout(() => { powerUpLabel.value = ''; }, 2200,);
}

function onLaunch() { waiting.value = false; }

function onLaunchKey(e: KeyboardEvent,) {
  if (e.key === ' ' || e.key === 'Enter') onLaunch();
}

function restart() {
  gameOver.value = false;
  won.value = false;
  waiting.value = true;
  score.value = 0;
  lives.value = 3;
  combo.value = 0;
  powerUpLabel.value = '';
  if (powerUpTimer !== null) { clearTimeout(powerUpTimer,); powerUpTimer = null; }
  game?.restart();
}

onMounted(() => {
  if (!canvasRef.value) return;

  canvasRef.value.addEventListener('click', onLaunch,);
  canvasRef.value.addEventListener('touchstart', onLaunch,);
  window.addEventListener('keydown', onLaunchKey,);

  game = createBreakoutGame(canvasRef.value, {
    onScore: (s,) => { score.value = s; },
    onLives: (l,) => {
      lives.value = l;
      if (l > 0) waiting.value = true;
    },
    onGameOver: () => { gameOver.value = true; },
    onWin: () => { won.value = true; },
    onCombo: (c,) => { combo.value = c; },
    onPowerUp: showPowerUp,
  },);
},);

onUnmounted(() => {
  game?.destroy();
  if (powerUpTimer !== null) clearTimeout(powerUpTimer,);
  canvasRef.value?.removeEventListener('click', onLaunch,);
  canvasRef.value?.removeEventListener('touchstart', onLaunch,);
  window.removeEventListener('keydown', onLaunchKey,);
},);
</script>

<style scoped>
.overlay-enter-active,
.overlay-leave-active { transition: opacity 0.25s ease; }
.overlay-enter-from,
.overlay-leave-to { opacity: 0; }

.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }

.combo-enter-active { transition: opacity 0.15s ease; }
.combo-leave-active { transition: opacity 0.3s ease; }
.combo-enter-from,
.combo-leave-to { opacity: 0; }

.powerup-enter-active { transition: opacity 0.2s ease; }
.powerup-leave-active { transition: opacity 0.4s ease; }
.powerup-enter-from,
.powerup-leave-to { opacity: 0; }
</style>
