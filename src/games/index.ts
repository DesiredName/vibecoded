import type { Game, } from '../types/game.ts';

export const GAMES: Game[] = [
  {
    id: 'snake',
    title: 'Snake 3D',
    description: 'Classic snake — eat the glowing orbs, dodge the walls. Arrow keys or WASD.',
    tags: ['3D', 'arcade',],
    load: () => import('./snake/SnakeGame.vue'),
  },
  {
    id: 'breakout',
    title: 'Breakout 3D',
    description: 'Classic brick-breaker in 3-D. Move the paddle to bounce the ball and clear all bricks.',
    tags: ['3D', 'arcade',],
    load: () => import('./breakout/BreakoutGame.vue'),
  },
];
