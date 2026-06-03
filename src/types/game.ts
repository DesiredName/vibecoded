import type { Component } from 'vue';

export type Game = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  load: () => Promise<{ default: Component }>;
};
