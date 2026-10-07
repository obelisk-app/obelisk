import type { GameDefinition } from './types';
import { GAME_META, type GameMeta } from './game-meta';

/**
 * Games available on the relay, and their rules engines, loaded on demand.
 *
 * Chain Reaction was ported from the classic Obelisk stack; Vesta is consumed
 * as a tracked upstream package (see `./vesta/definition.ts`). Chess and
 * tic-tac-toe still live in obelisk-classic and would each need the same
 * treatment: a pure engine is enough, everything in `session.ts` is
 * game-agnostic.
 *
 * An engine is its own download. Imported up front, every engine (Vesta's
 * rules included) rode in the chat shell for every user, game or no game.
 * Now names and icons come from `game-meta.ts`, and an engine is fetched the
 * first time a table of that game is replayed (`src/store/games/index.ts`) or
 * opened. Until it lands, replay of that table waits; nothing else does.
 *
 * `tests/app/app/lazy-mounts.test.tsx` fails if the shell reaches an engine
 * through a static import again.
 */

const LOADERS: Record<string, () => Promise<GameDefinition>> = {
  'chain-reaction': () => import('../chain-reaction/chain-reaction').then((m) => m.chainReaction as GameDefinition),
  vesta: () => import('../vesta/definition').then((m) => m.vesta as unknown as GameDefinition),
  stacker: () => import('../stacker/definition').then((m) => m.stacker as unknown as GameDefinition),
};

/** How long a failed engine download waits before a read may try it again. */
export const ENGINE_RETRY_MS = 5000;

/**
 * Engines loaded so far, by game type. Tests may register a definition here
 * directly; production only ever fills it through {@link loadGameDef}.
 */
export const GAMES: Record<string, GameDefinition> = {};

const pending = new Map<string, Promise<GameDefinition | null>>();
const failedAt = new Map<string, number>();
const listeners = new Set<(type: string) => void>();

function own<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

/** A game this client can play: one with an engine to load. */
export function isKnownGame(type: string): boolean {
  return own(LOADERS, type) !== undefined;
}

/**
 * The engine for `type` if it has loaded, else null: for an unknown game, and
 * for a known one still downloading (see {@link loadGameDef}). `type` comes
 * off the wire, so an inherited key like `constructor` is never a game.
 */
export function getGameDef(type: string): GameDefinition | null {
  return own(GAMES, type) ?? null;
}

/**
 * Fetch the engine for `type`. Resolves null for a game this client does
 * not know, or when the download failed (logged; the next call after
 * {@link ENGINE_RETRY_MS} tries again). Never rejects.
 */
export function loadGameDef(type: string): Promise<GameDefinition | null> {
  const loaded = getGameDef(type);
  if (loaded) return Promise.resolve(loaded);
  const load = own(LOADERS, type);
  if (!load) return Promise.resolve(null);
  const inFlight = pending.get(type);
  if (inFlight) return inFlight;
  const p = load().then(
    (def) => {
      GAMES[type] = def;
      failedAt.delete(type);
      for (const cb of listeners) cb(type);
      return def;
    },
    (err: unknown) => {
      failedAt.set(type, Date.now());
      console.warn('[games] could not load the engine for', type, err);
      return null;
    },
  ).finally(() => pending.delete(type));
  pending.set(type, p);
  return p;
}

/**
 * Start fetching the engine for `type` unless it is loaded, loading, or
 * failed a moment ago. Safe to call on every read.
 */
export function requestGameDef(type: string): void {
  if (getGameDef(type) || pending.has(type) || !isKnownGame(type)) return;
  const failed = failedAt.get(type);
  if (failed !== undefined && Date.now() - failed < ENGINE_RETRY_MS) return;
  void loadGameDef(type);
}

/** Called with the game type each time an engine finishes loading. */
export function onGameDefLoaded(cb: (type: string) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/**
 * Install an engine that is already in hand, for code that imports engines
 * statically on purpose (the dev screenshot harness). The app never does.
 */
export function registerGameDef(def: GameDefinition): void {
  GAMES[def.type] = def;
  for (const cb of listeners) cb(def.type);
}

/** Every engine, loaded. For tests. */
export async function loadAllGameDefs(): Promise<void> {
  await Promise.all(Object.keys(LOADERS).map((type) => loadGameDef(type)));
}

/** Test seam: forget every loaded engine and failed attempt. */
export function __resetGameDefsForTests(): void {
  for (const key of Object.keys(GAMES)) delete GAMES[key];
  pending.clear();
  failedAt.clear();
}

export function listGames(): Array<Omit<GameMeta, 'realtime'>> {
  return GAME_META.map((g) => ({
    type: g.type,
    displayName: g.displayName,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
    defaultTurnTimeoutS: g.defaultTurnTimeoutS,
  }));
}
