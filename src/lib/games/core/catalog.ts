/**
 * Display metadata for the games in the registry.
 *
 * The registry knows the RULES; this knows what a game looks like in the UI:
 * its name, its glyph, its limits. (Its one-line pitch and the summary line
 * are copy: `src/utils/games/copy/game-copy.ts` words them.) Everything user-facing reads
 * from here and is keyed by `session.game`, so a table can never be labelled
 * as a different game than the one it is running. (It could, once: the card
 * and the modal both hardcoded "Chain Reaction", which made a Vesta table
 * look like a Chain Reaction table in chat.)
 *
 * It reads `game-meta.ts`, never an engine: a chat card or the picker can
 * name a game without downloading its rules (see `registry.ts`).
 */
import { GAME_META, gameMeta } from './game-meta';

export interface GameInfo {
  type: string;
  displayName: string;
  minPlayers: number;
  maxPlayers: number;
  defaultTurnTimeoutS: number;
  /** Compact glyph for tight spots: chat cards, modal headers. */
  icon: string;
  /**
   * Real-time games run every board at once. That rules out hot-seat: you
   * cannot pass a keyboard between players who are all playing right now.
   */
  realtime: boolean;
}

const ICONS: Record<string, string> = {
  'chain-reaction': '⚛',
  vesta: '🏛',
  stacker: '🧱',
};

export function gameInfo(type: string): GameInfo | null {
  const def = gameMeta(type);
  if (!def) return null;
  return {
    type: def.type,
    displayName: def.displayName,
    minPlayers: def.minPlayers,
    maxPlayers: def.maxPlayers,
    defaultTurnTimeoutS: def.defaultTurnTimeoutS,
    icon: ICONS[def.type] ?? '🎲',
    realtime: def.realtime === true,
  };
}

/** Everything playable, for the picker. */
export function gameCatalog(): GameInfo[] {
  return GAME_META
    .map((g) => gameInfo(g.type))
    .filter((g): g is GameInfo => g !== null);
}

/** Name for a table whose game we may not recognise (an older or newer client). */
export function gameName(type: string): string {
  return gameInfo(type)?.displayName ?? type;
}

export function gameIcon(type: string): string {
  return gameInfo(type)?.icon ?? '🎲';
}
