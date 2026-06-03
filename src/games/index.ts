import type { Game, } from '../types/game.ts';

export const GAMES: Game[] = [
  {
    id: 'snake',
    title: 'Snake 3D',
    description: 'Classic snake — eat the glowing orbs, dodge the walls. Arrow keys or WASD.',
    tags: ['3D', 'arcade',],
    load: () => import('./snake/SnakeGame.vue'),
  },
];
