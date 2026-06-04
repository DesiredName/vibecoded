<template>
  <div class="min-h-screen bg-gray-950 text-white">
    <header class="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
      <div class="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
        <span class="text-2xl">🕹️</span>
        <div>
          <h1 class="text-xl font-bold tracking-tight">
            VibeCoded
          </h1>
          <p class="text-xs text-gray-500 leading-none mt-0.5">
            Mini Games Portal
          </p>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-6 py-10">
      <div
        v-if="gridItems.length > 0"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
      >
        <template
          v-for="cell in gridItems"
          :key="cell.type === 'game' ? cell.game.id : cell.item.id"
        >
          <GameCard
            v-if="cell.type === 'game'"
            :game="cell.game"
          />
          <NewsCard
            v-else
            :item="cell.item"
          />
        </template>
      </div>

      <EmptyState v-else />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, } from 'vue';
import GameCard from '../components/GameCard.vue';
import NewsCard from '../components/NewsCard.vue';
import EmptyState from '../components/EmptyState.vue';
import { gamesStore, } from '../stores/games.ts';
import { newsStore, } from '../stores/news.ts';
import type { Game, } from '../types/game.ts';
import type { NewsItem, } from '../types/news.ts';

type GridItem =
  | { type: 'game'; game: Game }
  | { type: 'news'; item: NewsItem };

const gridItems = computed<GridItem[]>(() => {
  const result: GridItem[] = [];
  let newsIdx = 0;
  gamesStore.games.forEach((game, i,) => {
    if (i > 0 && i % 3 === 0 && newsIdx < newsStore.items.length) {
      result.push({ type: 'news', item: newsStore.items[newsIdx++], },);
    }
    result.push({ type: 'game', game, },);
  },);
  return result;
},);

onMounted(() => {
  void newsStore.fetch();
},);
</script>
