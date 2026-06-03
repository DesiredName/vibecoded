import { reactive } from 'vue';
import type { Game } from '../types/game.ts';
import { GAMES } from '../games/index.ts';

type GamesState = {
  games: Game[];
};

const state = reactive<GamesState>({
  games: GAMES,
});

export const gamesStore = {
  get games(): readonly Game[] { return state.games; },
};
