<template>
  <div class="relative w-full h-full">
    <canvas
      ref="canvasRef"
      class="absolute inset-0 w-full h-full block"
    />

    <!-- HUD -->
    <div class="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-6 bg-gray-900/80 backdrop-blur-sm border border-gray-700/60 rounded-full px-6 py-2 text-sm font-mono pointer-events-none select-none">
      <span>Score: <span class="text-cyan-400 font-bold">{{ score }}</span></span>
      <span class="text-gray-600">|</span>
      <span class="flex gap-1 text-cyan-400">
        <span
          v-for="i in 3"
          :key="i"
          :class="i <= lives ? 'opacity-100' : 'opacity-20'"
        >▲</span>
      </span>
    </div>

    <!-- Desktop controls hint -->
    <div class="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs text-gray-700 pointer-events-none select-none hidden sm:block">
      ← → rotate &nbsp;|&nbsp; ↑ / W thrust &nbsp;|&nbsp; Space fire
    </div>

    <!-- Mobile virtual controls -->
    <div class="absolute bottom-0 inset-x-0 flex justify-between items-end p-4 sm:hidden select-none">
      <div class="flex gap-3">
        <button
          class="w-14 h-14 rounded-full bg-gray-800/80 border border-gray-600/60 text-white text-xl flex items-center justify-center active:bg-gray-600/80"
          @touchstart.prevent="setCtrl('left', true)"
          @touchend.prevent="setCtrl('left', false)"
          @touchcancel.prevent="setCtrl('left', false)"
        >
          ◄
        </button>
        <button
          class="w-14 h-14 rounded-full bg-gray-800/80 border border-gray-600/60 text-white text-xl flex items-center justify-center active:bg-gray-600/80"
          @touchstart.prevent="setCtrl('right', true)"
          @touchend.prevent="setCtrl('right', false)"
          @touchcancel.prevent="setCtrl('right', false)"
        >
          ►
        </button>
      </div>

      <div class="flex gap-3">
        <button
          class="w-14 h-14 rounded-full bg-gray-800/80 border border-gray-600/60 text-cyan-400 text-xl flex items-center justify-center active:bg-gray-600/80"
          @touchstart.prevent="setCtrl('thrust', true)"
          @touchend.prevent="setCtrl('thrust', false)"
          @touchcancel.prevent="setCtrl('thrust', false)"
        >
          ▲
        </button>
        <button
          class="w-14 h-14 rounded-full bg-yellow-900/80 border border-yellow-600/60 text-yellow-400 text-xl flex items-center justify-center active:bg-yellow-700/80"
          @touchstart.prevent="setCtrl('fire', true)"
          @touchend.prevent="setCtrl('fire', false)"
          @touchcancel.prevent="setCtrl('fire', false)"
        >
          ●
        </button>
      </div>
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
          Score: <span class="text-cyan-400 font-bold">{{ score }}</span>
        </p>
        <button
          class="px-8 py-3 bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-gray-950 font-bold rounded-xl transition-colors text-base tracking-wide"
          @click="restart"
        >
          Play Again
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, } from 'vue';
import { createAsteroidsGame, } from './game.ts';

const canvasRef = ref<HTMLCanvasElement | null>(null,);
const score = ref(0,);
const lives = ref(3,);
const gameOver = ref(false,);

let game: ReturnType<typeof createAsteroidsGame> | null = null;

function setCtrl(key: 'left' | 'right' | 'thrust' | 'fire', value: boolean,) {
  if (!game) return;
  game.controls[key] = value;
}

function restart() {
  gameOver.value = false;
  score.value = 0;
  lives.value = 3;
  game?.restart();
}

onMounted(() => {
  if (!canvasRef.value) return;
  game = createAsteroidsGame(canvasRef.value, {
    onScore: (s,) => { score.value = s; },
    onLives: (l,) => { lives.value = l; },
    onGameOver: () => { gameOver.value = true; },
  },);
},);

onUnmounted(() => {
  game?.destroy();
},);
</script>

<style scoped>
.overlay-enter-active,
.overlay-leave-active { transition: opacity 0.25s ease; }
.overlay-enter-from,
.overlay-leave-to { opacity: 0; }
</style>
