<template>
  <div
    class="group rounded-xl bg-gray-900 border border-gray-800 overflow-hidden min-h-44 transition-all duration-200"
    :class="item ? 'hover:border-amber-500/60 hover:shadow-xl hover:shadow-amber-900/20 hover:-translate-y-0.5' : ''"
  >
    <Transition name="news-fade">
      <a
        v-if="item"
        :href="item.url"
        target="_blank"
        rel="noopener noreferrer"
        class="block"
      >
        <div class="px-4 pt-4 pb-0 flex items-center justify-between">
          <span class="text-xs font-semibold tracking-widest uppercase text-amber-500/80">
            News
          </span>
          <span class="text-xs text-gray-600">
            {{ item.source }}
          </span>
        </div>
        <div class="p-4 pt-2">
          <h3 class="font-semibold text-white group-hover:text-amber-400 transition-colors duration-150 line-clamp-2 leading-snug">
            {{ item.title }}
          </h3>
          <p class="text-sm text-gray-400 mt-2 line-clamp-3 leading-relaxed">
            {{ item.summary }}
          </p>
          <p class="text-xs text-gray-600 mt-3">
            {{ formatDate(item.publishedAt) }}
          </p>
        </div>
      </a>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import type { NewsItem, } from '../types/news.ts';

defineProps<{
  item: NewsItem | null;
}>();

function formatDate(raw: string): string {
  try {
    return new Date(raw,).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', },);
  } catch {
    return raw;
  }
}
</script>

<style scoped>
.news-fade-enter-active {
  transition: opacity 0.5s ease;
}
.news-fade-enter-from {
  opacity: 0;
}
</style>
