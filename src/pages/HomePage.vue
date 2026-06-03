<template>
  <div class="min-h-screen bg-gray-950 text-white">
    <header class="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
      <div class="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
        <span class="text-2xl">🕹️</span>
        <div>
          <h1 class="text-xl font-bold tracking-tight">VibeCoded</h1>
          <p class="text-xs text-gray-500 leading-none mt-0.5">Mini Games Portal</p>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-6 py-10">
      <div v-if="games.length > 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        <GameCard v-for="game in games" :key="game.id" :game="game" />
      </div>

      <EmptyState v-else />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import GameCard from '../components/GameCard.vue';
import EmptyState from '../components/EmptyState.vue';
import { gamesStore } from '../stores/games.ts';

const games = computed(() => gamesStore.games);
</script>
