<template>
  <div class="min-h-screen bg-gray-950 text-white flex flex-col">
    <header class="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10 shrink-0">
      <div class="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
        <RouterLink
          to="/"
          class="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors duration-150"
        >
          <span>←</span>
          <span>All games</span>
        </RouterLink>
        <div v-if="game" class="flex items-center gap-3 border-l border-gray-800 pl-4">
          <span class="font-semibold text-white">{{ game.title }}</span>
          <div class="flex gap-1.5">
            <span
              v-for="tag in game.tags"
              :key="tag"
              class="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700"
            >
              {{ tag }}
            </span>
          </div>
        </div>
      </div>
    </header>

    <div class="flex-1 flex flex-col">
      <div v-if="!game" class="flex flex-col items-center justify-center flex-1 gap-4">
        <span class="text-5xl opacity-30">🔍</span>
        <p class="text-gray-500 text-sm">Game not found.</p>
        <RouterLink to="/" class="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
          Back to all games
        </RouterLink>
      </div>

      <Suspense v-else>
        <component :is="gameComponent" class="flex-1" />
        <template #fallback>
          <GameLoader />
        </template>
      </Suspense>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import GameLoader from '../components/GameLoader.vue';
import { gamesStore } from '../stores/games.ts';

const route = useRoute();

const game = computed(() => gamesStore.games.find(g => g.id === route.params['id']));

const gameComponent = computed(() =>
  game.value
    ? defineAsyncComponent(game.value.load)
    : null,
);
</script>
