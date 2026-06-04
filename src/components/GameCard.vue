<template>
  <RouterLink
    :to="`/games/${game.id}`"
    class="group block rounded-xl bg-gray-900 border border-gray-800 overflow-hidden hover:border-indigo-500/60 transition-all duration-200 hover:shadow-xl hover:shadow-indigo-900/30 hover:-translate-y-0.5"
  >
    <div class="aspect-video bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center relative overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-purple-900/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
      <Gamepad2 :size="48" class="text-gray-600 select-none" />
    </div>
    <div class="p-4">
      <h3 class="font-semibold text-white group-hover:text-indigo-400 transition-colors duration-150 truncate">
        {{ game.title }}
      </h3>
      <p class="text-sm text-gray-400 mt-1 line-clamp-2 leading-relaxed">
        {{ game.description }}
      </p>
      <div
        v-if="game.tags.length > 0"
        class="flex gap-1.5 mt-3 flex-wrap"
      >
        <span
          v-for="tag in game.tags"
          :key="tag"
          class="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700"
        >
          {{ tag }}
        </span>
      </div>
    </div>
  </RouterLink>
</template>

<script setup lang="ts">
import { RouterLink, } from 'vue-router';
import { Gamepad2, } from '@lucide/vue';
import type { Game, } from '../types/game.ts';

defineProps<{
  game: Game;
}>();
</script>
