# VibeCoded — Mini Games Portal

A static mini-games portal built with Vite + Vue 3 + TypeScript + Three.js + Tailwind CSS v4.
No backend, no auth, no server-side logic.

---

## Tech Stack

| Tool | Version | Notes |
|---|---|---|
| Vite | 8.x | Dev server & bundler |
| Vue 3 | 3.5.x | Composition API only |
| TypeScript | 6.x | Strict + verbatimModuleSyntax |
| Three.js | 0.184.x | For 3-D games |
| Tailwind CSS | 4.x | `@tailwindcss/vite` plugin, no config file |
| Vue Router | 5.x | Client-side routing |
| ESLint | 10.x | Flat config, see `eslint.config.js` |

---

## Project Structure

```
src/
  components/        # Reusable UI pieces (not page-specific)
  games/
    index.ts         # Central game registry — add every new game here
    <game-name>/     # One folder per game
      <GameName>.vue # Game component (mounted full-screen on GamePage)
      game.ts        # Game logic (Three.js scene, update loop, etc.)
  pages/
    HomePage.vue     # Grid of all games
    GamePage.vue     # Loads a single game by route :id
  router/
    index.ts
  stores/
    games.ts         # Module-level singleton — import gamesStore anywhere
  types/
    game.ts          # Shared Game type
  utils/             # Extract here when a function is reused in 2+ places
  main.ts
  App.vue
  style.css
```

---

## Adding a New Game

1. Create `src/games/<id>/` with a `.vue` component and optional `game.ts`.
2. Register it in `src/games/index.ts`:

```ts
import type { Game } from '../../types/game.ts';

export const GAMES: Game[] = [
  {
    id: 'snake',
    title: 'Snake',
    description: 'Classic snake game in 3-D.',
    tags: ['3D', 'arcade'],
    load: () => import('./snake/SnakeGame.vue'),
  },
];
```

3. The game automatically appears on the home-page grid and is routable at `/games/<id>`.

---

## TypeScript Rules

- **`strict: true`** and **`verbatimModuleSyntax: true`** are enforced.
- Always use `import type { … }` for type-only imports.
- Always use `export type { … }` for type-only re-exports.
- Prefer `type` keyword over `interface` — no `interface` declarations.
- No enums (`erasableSyntaxOnly: true`). Use const objects + `as const` instead.

```ts
// correct
export type Direction = 'up' | 'down' | 'left' | 'right';
const DIRECTIONS = { UP: 'up', DOWN: 'down' } as const;

// wrong
enum Direction { Up, Down }
interface Direction { … }
```

---

## Vue Component Rules

- Composition API with `<script setup lang="ts">` — no Options API.
- Split page templates into focused child components (one concern per file).
  - `HomePage.vue` orchestrates; `GameCard.vue` renders one card.
  - If a template block does one distinct thing, it belongs in its own file.
- Import components explicitly in `<script setup>` — no global registration.
- Use `defineProps<{ … }>()` with inline types (not `withDefaults` unless defaults are needed).

---

## Store Rules

Stores are plain reactive module singletons — no Pinia, no Vuex.

```ts
// src/stores/example.ts
import { reactive } from 'vue';
import type { SomeType } from '../types/some.ts';

type State = { items: SomeType[] };

const state = reactive<State>({ items: [] });

export const exampleStore = {
  get items() { return state.items; },
  add(item: SomeType) { state.items.push(item); },
};
```

- One store file per domain.
- Export a named const (never `export default`).
- Expose only what consumers need; keep mutation helpers inside the store.

---

## ESLint Rules (flat config)

| Rule | Setting |
|---|---|
| `semi` | `error` — always required |
| `comma-dangle` | `error` — `"all"` (trailing commas everywhere, including function params) |
| `@typescript-eslint/no-unused-vars` | `warn` — names prefixed with `_` are exempt |

Run: `npm run lint`

---

## Utility Functions

A function becomes a utility when the **same logic** appears in 2 or more unrelated places.

- Extract it to `src/utils/<topic>.ts`.
- Keep one logical topic per file (e.g., `math.ts`, `canvas.ts`, `three.ts`).
- Export as named functions — no default exports from utils.

---

## Code Style Summary

- `type` over `interface`
- Plain objects / closures over `class`
- Module-level singletons over instantiated services
- No comments unless the *why* is non-obvious
- No backwards-compat shims for removed code — delete it
- Semicolons required, trailing commas everywhere
