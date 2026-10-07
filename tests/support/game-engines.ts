/**
 * Game engines load on demand in the app (`src/lib/games/core/registry.ts`): a
 * table replays to null until its engine has downloaded. Suites that replay
 * tables synchronously import this first, so every engine is in place before
 * their first line runs. Suites about the loading itself must not.
 */
import { loadAllGameDefs } from '@/lib/games/core/registry';

await loadAllGameDefs();
