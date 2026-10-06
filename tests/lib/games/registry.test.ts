import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Engines load on demand. Chain Reaction's download is under the test's
 * control here: it can be made to fail, to prove a failed download is
 * survivable and retried.
 */
const ctl = vi.hoisted(() => ({ failCr: false }));
vi.mock('@/lib/games/chain-reaction', async (importOriginal) => {
  if (ctl.failCr) throw new Error('chunk failed');
  return importOriginal();
});

import {
  ENGINE_RETRY_MS,
  GAMES,
  __resetGameDefsForTests,
  getGameDef,
  isKnownGame,
  listGames,
  loadAllGameDefs,
  loadGameDef,
  onGameDefLoaded,
  requestGameDef,
} from '@/lib/games/registry';
import { GAME_META } from '@/lib/games/game-meta';
import { gameCatalog, gameIcon, gameInfo, gameName } from '@/lib/games/catalog';

describe('game registry', () => {
  beforeEach(() => __resetGameDefsForTests());
  afterEach(() => vi.restoreAllMocks());

  it('names, icons and the picker need no engine', () => {
    expect(gameCatalog().map((g) => g.type)).toEqual(['chain-reaction', 'vesta', 'stacker']);
    expect(gameName('vesta')).toBe('Vesta');
    expect(gameIcon('stacker')).toBe('🧱');
    expect(gameInfo('stacker')?.realtime).toBe(true);
    expect(listGames().map((g) => g.type)).toEqual(['chain-reaction', 'vesta', 'stacker']);
    expect(Object.keys(GAMES)).toEqual([]);
    expect(getGameDef('vesta')).toBeNull();
  });

  it('loads an engine on request, once, and says so', async () => {
    const loaded = vi.fn();
    const off = onGameDefLoaded(loaded);
    expect(isKnownGame('vesta')).toBe(true);
    const [a, b] = await Promise.all([loadGameDef('vesta'), loadGameDef('vesta')]);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(getGameDef('vesta')).toBe(a);
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(loaded).toHaveBeenCalledWith('vesta');
    off();
  });

  it('never loads anything for an unknown game, or for a key every object inherits', async () => {
    for (const type of ['chess', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(isKnownGame(type)).toBe(false);
      expect(getGameDef(type)).toBeNull();
      await expect(loadGameDef(type)).resolves.toBeNull();
      expect(() => requestGameDef(type)).not.toThrow();
    }
    expect(gameInfo('constructor')).toBeNull();
    expect(gameName('constructor')).toBe('constructor');
  });

  it('survives a failed download, waits before retrying, then loads', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      ctl.failCr = true;
      await expect(loadGameDef('chain-reaction')).resolves.toBeNull();
      expect(warn).toHaveBeenCalled();
      ctl.failCr = false;
      // Too soon: a read right after a failure does not hammer the network.
      requestGameDef('chain-reaction');
      await vi.advanceTimersByTimeAsync(0);
      expect(getGameDef('chain-reaction')).toBeNull();
      vi.setSystemTime(1_000_000 + ENGINE_RETRY_MS + 1);
      requestGameDef('chain-reaction');
      await vi.waitFor(() => expect(getGameDef('chain-reaction')).not.toBeNull());
    } finally {
      vi.useRealTimers();
    }
  });

  it('every engine carries exactly the metadata the catalog shows', async () => {
    await loadAllGameDefs();
    for (const meta of GAME_META) {
      const def = getGameDef(meta.type)!;
      expect(def).not.toBeNull();
      expect({
        type: def.type,
        displayName: def.displayName,
        minPlayers: def.minPlayers,
        maxPlayers: def.maxPlayers,
        defaultTurnTimeoutS: def.defaultTurnTimeoutS,
        realtime: def.realtime,
      }).toEqual({ realtime: undefined, ...meta });
      // A real-time game brings its match reducer, or replay cannot start it.
      if (meta.realtime) expect(def.match).toBeDefined();
    }
  });
});
