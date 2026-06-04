<template>
  <div class="relative w-full h-full select-none overflow-hidden">
    <canvas
      ref="canvasRef"
      class="absolute inset-0 w-full h-full block touch-manipulation"
      @click="onCanvasClick"
    />

    <!-- HUD top bar -->
    <div class="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-gray-900/85 backdrop-blur-sm border border-gray-700/50 rounded-full px-4 py-1.5 text-xs sm:text-sm font-mono pointer-events-none whitespace-nowrap">
      <span>Wave <span class="text-cyan-400 font-bold">{{ wave || 'â€”' }}</span></span>
      <span class="text-gray-600">|</span>
      <span>Gold <span class="text-yellow-400 font-bold">{{ gold }}</span></span>
      <span class="text-gray-600">|</span>
      <span>Kills <span class="text-green-400 font-bold">{{ score }}</span></span>
      <span class="text-gray-600">|</span>
      <span>Lives <span class="text-red-400 font-bold">{{ lives }}</span></span>
    </div>

    <!-- Wave prep countdown -->
    <Transition name="overlay">
      <div
        v-if="phase === 'prep' && !gameOver"
        class="absolute left-1/2 top-14 sm:top-16 -translate-x-1/2 bg-gray-900/80 border border-gray-600/40 rounded-xl px-5 py-2.5 text-center pointer-events-none"
      >
        <p class="text-gray-400 text-xs mb-0.5">
          Place your towers!
        </p>
        <p class="text-white font-bold text-lg leading-tight">
          Wave {{ wave + 1 }} in <span class="text-cyan-400">{{ Math.ceil(prepTimer) }}s</span>
        </p>
      </div>
    </Transition>

    <!-- Tower selector bar -->
    <div
      v-if="!gameOver"
      class="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2"
    >
      <button
        v-for="t in towerTypes"
        :key="t"
        class="flex flex-col items-center rounded-xl border-2 transition-colors px-3 py-1.5 min-w-[72px] sm:min-w-[80px] active:opacity-70"
        :class="selectedTower === t
          ? 'bg-gray-700/90 border-white/30'
          : 'bg-gray-900/80 border-gray-600/40 hover:border-gray-500/60'"
        :style="selectedTower === t ? { borderColor: DEFS[t].hex } : {}"
        @click.stop="selectedTower = t"
      >
        <span
          class="text-sm font-bold mb-0.5"
          :style="{ color: DEFS[t].hex }"
        >{{ DEFS[t].icon }}</span>
        <span class="text-white text-xs font-mono">{{ DEFS[t].label }}</span>
        <span class="text-yellow-400 text-xs font-mono">{{ DEFS[t].cost }}g</span>
      </button>
    </div>

    <!-- Insufficient gold flash -->
    <Transition name="overlay">
      <div
        v-if="showNoGold"
        class="absolute left-1/2 bottom-24 -translate-x-1/2 bg-red-900/80 border border-red-500/50 rounded-lg px-4 py-1.5 text-red-300 text-sm font-mono pointer-events-none"
      >
        Not enough gold!
      </div>
    </Transition>

    <!-- Game Over overlay -->
    <Transition name="overlay">
      <div
        v-if="gameOver"
        class="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/85 backdrop-blur-sm"
      >
        <p class="text-5xl font-black text-white tracking-tight mb-2">
          Game Over
        </p>
        <p class="text-gray-400 text-lg mb-1">
          Survived <span class="text-cyan-400 font-bold">{{ wave }}</span> {{ wave === 1 ? 'wave' : 'waves' }}
        </p>
        <p class="text-gray-400 text-lg mb-8">
          Kills: <span class="text-green-400 font-bold">{{ score }}</span>
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
import { createTowerDefenseGame, TOWER_DEFS, } from './game.ts';
import type { TowerType, Phase, } from './game.ts';

const canvasRef = ref<HTMLCanvasElement | null>(null,);
const wave = ref(0,);
const gold = ref(0,);
const score = ref(0,);
const lives = ref(20,);
const phase = ref<Phase>('prep',);
const prepTimer = ref(6,);
const gameOver = ref(false,);
const showNoGold = ref(false,);
const selectedTower = ref<TowerType>('basic',);

const towerTypes: TowerType[] = ['basic', 'sniper', 'splash',];

const DEFS = {
  basic:  { label: 'Basic',  icon: 'â– ', hex: '#00aaff', cost: TOWER_DEFS.basic.cost,  },
  sniper: { label: 'Sniper', icon: 'â–²', hex: '#9933ff', cost: TOWER_DEFS.sniper.cost, },
  splash: { label: 'Splash', icon: 'â—‰', hex: '#ff6600', cost: TOWER_DEFS.splash.cost, },
} as const;

let game: ReturnType<typeof createTowerDefenseGame> | null = null;
let noGoldTimer: ReturnType<typeof setTimeout> | null = null;

function flashNoGold() {
  showNoGold.value = true;
  if (noGoldTimer) clearTimeout(noGoldTimer,);
  noGoldTimer = setTimeout(() => { showNoGold.value = false; }, 1200,);
}

function onCanvasClick(e: MouseEvent,) {
  if (!game || gameOver.value) return;
  const cell = game.canvasToCell(e.clientX, e.clientY,);
  if (!cell) return;
  const placed = game.placeTower(cell.col, cell.row, selectedTower.value,);
  if (!placed && gold.value < TOWER_DEFS[selectedTower.value].cost) flashNoGold();
}

function restart() {
  gameOver.value = false;
  showNoGold.value = false;
  game?.restart();
}

onMounted(() => {
  if (!canvasRef.value) return;
  game = createTowerDefenseGame(canvasRef.value, {
    onWave:      (n,) => { wave.value = n; },
    onGold:      (g,) => { gold.value = g; },
    onScore:     (s,) => { score.value = s; },
    onLives:     (l,) => { lives.value = l; },
    onPhase:     (p,) => { phase.value = p; },
    onPrepTimer: (s,) => { prepTimer.value = s; },
    onGameOver:  () => { gameOver.value = true; },
  },);
},);

onUnmounted(() => {
  if (noGoldTimer) clearTimeout(noGoldTimer,);
  game?.destroy();
},);
</script>

<style scoped>
.overlay-enter-active,
.overlay-leave-active { transition: opacity 0.2s ease; }
.overlay-enter-from,
.overlay-leave-to { opacity: 0; }
</style>
