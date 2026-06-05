<template>
  <div class="relative w-full h-full select-none overflow-hidden">
    <canvas
      ref="canvasRef"
      class="absolute inset-0 w-full h-full block touch-manipulation"
      @click="onCanvasClick"
    />

    <!-- HUD top bar -->
    <div class="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-gray-900/85 backdrop-blur-sm border border-gray-700/50 rounded-full px-4 py-1.5 text-xs sm:text-sm font-mono pointer-events-none whitespace-nowrap">
      <span>Wave <span class="text-cyan-400 font-bold">{{ wave || '—' }}</span></span>
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

    <!-- Sell mode hint -->
    <Transition name="overlay">
      <div
        v-if="sellMode && !gameOver"
        class="absolute left-1/2 bottom-24 -translate-x-1/2 bg-red-950/90 border border-red-500/50 rounded-lg px-4 py-1.5 text-red-300 text-xs font-mono pointer-events-none whitespace-nowrap"
      >
        Tap a tower to sell it for 50%
      </div>
    </Transition>

    <!-- Tower selector + sell bar -->
    <div
      v-if="!gameOver"
      class="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2"
    >
      <button
        v-for="t in towerTypes"
        :key="t"
        class="flex flex-col items-center rounded-xl border-2 transition-colors px-3 py-1.5 min-w-18 sm:min-w-20 active:opacity-70"
        :class="selectedTower === t && !sellMode
          ? 'bg-gray-700/90 border-white/30'
          : 'bg-gray-900/80 border-gray-600/40 hover:border-gray-500/60'"
        :style="selectedTower === t && !sellMode ? { borderColor: DEFS[t].hex } : {}"
        @click.stop="selectTower(t)"
      >
        <component
          :is="DEFS[t].icon"
          :size="16"
          class="mb-0.5"
          :style="{ color: DEFS[t].hex }"
        />
        <span class="text-white text-xs font-mono">{{ DEFS[t].label }}</span>
        <span class="text-yellow-400 text-xs font-mono">{{ DEFS[t].cost }}g</span>
      </button>

      <!-- Sell button -->
      <button
        class="flex flex-col items-center rounded-xl border-2 transition-colors px-3 py-1.5 min-w-18 sm:min-w-20 active:opacity-70"
        :class="sellMode
          ? 'bg-red-900/80 border-red-400'
          : 'bg-gray-900/80 border-gray-600/40 hover:border-red-500/60'"
        @click.stop="sellMode = !sellMode"
      >
        <Trash2
          :size="16"
          class="mb-0.5"
          :style="{ color: sellMode ? '#f87171' : '#9ca3af' }"
        />
        <span
          class="text-xs font-mono"
          :class="sellMode ? 'text-red-300' : 'text-gray-400'"
        >Sell</span>
        <span
          class="text-xs font-mono"
          :class="sellMode ? 'text-red-400' : 'text-gray-500'"
        >50%</span>
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

    <!-- Sold notification -->
    <Transition name="overlay">
      <div
        v-if="soldLabel"
        class="absolute left-1/2 bottom-24 -translate-x-1/2 bg-yellow-900/80 border border-yellow-500/50 rounded-lg px-4 py-1.5 text-yellow-300 text-sm font-mono pointer-events-none"
      >
        {{ soldLabel }}
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
import { ref, onMounted, onUnmounted } from 'vue';
import { Shield, Zap, Bomb, Trash2 } from '@lucide/vue';
import { createTowerDefenseGame, TOWER_DEFS } from './game.ts';
import type { TowerType, Phase } from './game.ts';

const canvasRef = ref<HTMLCanvasElement | null>(null);
const wave = ref(0);
const gold = ref(0);
const score = ref(0);
const lives = ref(20);
const phase = ref<Phase>('prep');
const prepTimer = ref(6);
const gameOver = ref(false);
const showNoGold = ref(false);
const soldLabel = ref('');
const selectedTower = ref<TowerType>('basic');
const sellMode = ref(false);

const towerTypes: TowerType[] = ['basic', 'sniper', 'splash'];

const DEFS = {
  basic:  { label: 'Basic',  icon: Shield, hex: '#00aaff', cost: TOWER_DEFS.basic.cost  },
  sniper: { label: 'Sniper', icon: Zap,    hex: '#9933ff', cost: TOWER_DEFS.sniper.cost },
  splash: { label: 'Splash', icon: Bomb,   hex: '#ff6600', cost: TOWER_DEFS.splash.cost },
} as const;

let game: ReturnType<typeof createTowerDefenseGame> | null = null;
let noGoldTimer: ReturnType<typeof setTimeout> | null = null;
let soldTimer: ReturnType<typeof setTimeout> | null = null;

function flashNoGold() {
  showNoGold.value = true;
  if (noGoldTimer) clearTimeout(noGoldTimer);
  noGoldTimer = setTimeout(() => { showNoGold.value = false; }, 1200);
}

function showSold(refund: number) {
  soldLabel.value = `+${refund}g sold`;
  if (soldTimer) clearTimeout(soldTimer);
  soldTimer = setTimeout(() => { soldLabel.value = ''; }, 1400);
}

function selectTower(type: TowerType) {
  selectedTower.value = type;
  sellMode.value = false;
}

function onCanvasClick(e: MouseEvent) {
  if (!game || gameOver.value) return;
  const cell = game.canvasToCell(e.clientX, e.clientY);
  if (!cell) return;

  if (sellMode.value) {
    const refund = game.sellTower(cell.col, cell.row);
    if (refund > 0) {
      showSold(refund);
      sellMode.value = false;
    }
    return;
  }

  const placed = game.placeTower(cell.col, cell.row, selectedTower.value);
  if (!placed && gold.value < TOWER_DEFS[selectedTower.value].cost) flashNoGold();
}

function restart() {
  gameOver.value = false;
  showNoGold.value = false;
  soldLabel.value = '';
  sellMode.value = false;
  game?.restart();
}

onMounted(() => {
  if (!canvasRef.value) return;
  game = createTowerDefenseGame(canvasRef.value, {
    onWave:      (n) => { wave.value = n; },
    onGold:      (g) => { gold.value = g; },
    onScore:     (s) => { score.value = s; },
    onLives:     (l) => { lives.value = l; },
    onPhase:     (p) => { phase.value = p; },
    onPrepTimer: (s) => { prepTimer.value = s; },
    onGameOver:  () => { gameOver.value = true; sellMode.value = false; },
  });
});

onUnmounted(() => {
  if (noGoldTimer) clearTimeout(noGoldTimer);
  if (soldTimer) clearTimeout(soldTimer);
  game?.destroy();
});
</script>

<style scoped>
.overlay-enter-active,
.overlay-leave-active { transition: opacity 0.2s ease; }
.overlay-enter-from,
.overlay-leave-to { opacity: 0; }
</style>
