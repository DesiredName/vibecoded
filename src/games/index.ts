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
  {
    id: 'asteroids',
    title: 'Asteroids',
    description: 'Blast asteroids in deep space. Survive the waves — big rocks split into faster fragments.',
    tags: ['3D', 'arcade', 'shooter',],
    load: () => import('./asteroids/AsteroidsGame.vue'),
  },
  {
    id: 'tower-defense',
    title: 'Tower Defense',
    description: 'Build towers on a procedural map, stop endless waves of enemies. Monsters gain HP and armor each wave.',
    tags: ['strategy', 'arcade',],
    load: () => import('./tower-defense/TowerDefenseGame.vue'),
  },
  {
    id: 'moon-landing',
    title: 'Moon Landing',
    description: 'Pilot a descent module to a marked landing pad. Analog thrust and tilt controls, limited fuel, procedural terrain.',
    tags: ['3D', 'arcade', 'physics',],
    load: () => import('./moon-landing/MoonLandingGame.vue'),
  },
];
