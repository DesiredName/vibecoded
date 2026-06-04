import { reactive, } from 'vue';
import type { NewsItem, } from '../types/news.ts';

type NewsState = {
  items: NewsItem[];
  loading: boolean;
  error: string | null;
};

const state = reactive<NewsState>({
  items: [],
  loading: false,
  error: null,
},);

export const newsStore = {
  get items(): readonly NewsItem[] { return state.items; },
  get loading(): boolean { return state.loading; },
  get error(): string | null { return state.error; },

  async fetch(): Promise<void> {
    if (state.loading) return;
    state.loading = true;
    state.error = null;
    try {
      const res = await fetch('/api/news',);
      if (!res.ok) throw new Error(`HTTP ${res.status}`,);
      const data = await res.json() as { items: NewsItem[] };
      state.items = data.items;
    } catch (err) {
      state.error = err instanceof Error ? err.message : 'Unknown error';
    } finally {
      state.loading = false;
    }
  },
};
