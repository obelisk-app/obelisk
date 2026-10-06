/**
 * What every game is, without its rules: name, player limits and clock. The
 * one-line pitch is copy, so it lives in the `games` messages, keyed by type. Listing games, labelling a card and filling the picker read this;
 * none of them needs an engine.
 *
 * This is the single source for those fields. Each definition spreads its
 * entry (`chain-reaction.ts`, `vesta/definition.ts`, `stacker/definition.ts`),
 * and the engines themselves load on demand through `registry.ts`.
 */

export interface GameMeta {
  type: string;
  displayName: string;
  minPlayers: number;
  maxPlayers: number;
  defaultTurnTimeoutS: number;
  /** See `GameDefinition.realtime`. */
  realtime?: boolean;
}

export const CHAIN_REACTION_META = {
  type: 'chain-reaction',
  displayName: 'Chain Reaction',
  minPlayers: 2,
  maxPlayers: 8,
  defaultTurnTimeoutS: 45,
} as const satisfies GameMeta;

export const VESTA_META = {
  type: 'vesta',
  displayName: 'Vesta',
  minPlayers: 2,
  maxPlayers: 4,
  // No clock by default. Our clock is per ACTION, and a Vesta turn is many
  // actions (roll, build, trade, end) - a short timer would guillotine people
  // mid-thought. Hosts who want one should pick something generous.
  defaultTurnTimeoutS: 0,
} as const satisfies GameMeta;

export const STACKER_META = {
  type: 'stacker',
  displayName: 'Stacker',
  minPlayers: 1,
  maxPlayers: 6,
  // The clock here is gravity, not a turn timer.
  defaultTurnTimeoutS: 0,
  realtime: true,
} as const satisfies GameMeta;

/** Every game on the relay, in picker order. */
export const GAME_META: readonly GameMeta[] = [CHAIN_REACTION_META, VESTA_META, STACKER_META];

/** The entry for `type`, or null for a game this client does not know (an older or newer client's). */
export function gameMeta(type: string): GameMeta | null {
  return GAME_META.find((g) => g.type === type) ?? null;
}
