<template>
  <div
    ref="rootRef"
    class="relative w-full h-full"
  >
    <canvas
      ref="canvasRef"
      class="absolute inset-0 w-full h-full block"
    />

    <div class="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-900/80 backdrop-blur-sm border border-gray-700/60 rounded-full px-6 py-2 text-sm font-mono pointer-events-none select-none">
      Score: <span class="text-green-400 font-bold">{{ score }}</span>
    </div>

    <Transition name="powerup">
      <div
        v-if="powerUpLabel"
        class="absolute top-16 inset-x-0 flex justify-center pointer-events-none select-none"
      >
        <span
          class="font-black text-2xl tracking-widest px-4 py-1 rounded-lg"
          :class="powerUpLabel === 'GHOST MODE'
            ? 'text-blue-300 bg-blue-900/60'
            : 'text-yellow-300 bg-yellow-900/60'"
        >
          {{ powerUpLabel }}!
        </span>
      </div>
    </Transition>

    <div class="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs text-gray-600 pointer-events-none select-none">
      Arrow keys or WASD to move
    </div>

    <Transition name="overlay">
      <div
        v-if="dead"
        class="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/75 backdrop-blur-sm"
      >
        <p class="text-5xl font-black text-white tracking-tight mb-1">
          Game Over
        </p>
        <p class="text-gray-400 text-lg mb-8">
          Score: <span class="text-green-400 font-bold">{{ score }}</span>
        </p>
        <button
          class="px-8 py-3 bg-green-500 hover:bg-green-400 active:bg-green-600 text-gray-950 font-bold rounded-xl transition-colors text-base tracking-wide"
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
import { createSnakeGame, } from './game.ts';

const canvasRef = ref<HTMLCanvasElement | null>(null,);
const score = ref(0,);
const dead = ref(false,);
const powerUpLabel = ref('',);

let game: ReturnType<typeof createSnakeGame> | null = null;
let powerUpTimer: ReturnType<typeof setTimeout> | null = null;

function showPowerUp(label: string,) {
  powerUpLabel.value = label;
  if (powerUpTimer) clearTimeout(powerUpTimer,);
  powerUpTimer = setTimeout(() => { powerUpLabel.value = ''; }, 2200,);
}

function restart() {
  dead.value = false;
  score.value = 0;
  powerUpLabel.value = '';
  if (powerUpTimer) clearTimeout(powerUpTimer,);
  game?.restart();
}

onMounted(() => {
  if (!canvasRef.value) return;
  game = createSnakeGame(canvasRef.value, {
    onScore: (s,) => { score.value = s; },
    onDeath: () => { dead.value = true; },
    onPowerUp: showPowerUp,
  },);
},);

onUnmounted(() => {
  game?.destroy();
  if (powerUpTimer) clearTimeout(powerUpTimer,);
},);
</script>

<style scoped>
.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.25s ease;
}
.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}

.powerup-enter-active {
  transition: opacity 0.1s ease-out, transform 0.1s ease-out;
}
.powerup-leave-active {
  transition: opacity 0.5s ease-in, transform 0.5s ease-in;
}
.powerup-enter-from {
  opacity: 0;
  transform: scale(0.75);
}
.powerup-leave-to {
  opacity: 0;
  transform: scale(1.15) translateY(-8px);
}
</style>
