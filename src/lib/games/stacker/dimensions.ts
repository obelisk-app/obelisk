/**
 * The well's dimensions and cell alphabet, with no engine attached.
 *
 * Its own module so the protocol parser can cap an `attack` without pulling
 * the engine into the chat shell: the engine loads only when a Stacker table
 * is read (`../registry.ts`). `board.ts` and `engine.ts` re-export all of it.
 */
export const WIDTH = 10;
/** Visible rows. */
export const HEIGHT = 20;
/** Extra rows above the ceiling where pieces spawn and stacks may briefly poke. */
export const BUFFER = 20;
export const TOTAL_HEIGHT = HEIGHT + BUFFER;

/** 0 = empty, 8 = garbage, otherwise the 1-based index into PIECES. */
export type Cell = number;

export const GARBAGE_CELL = 8;

/**
 * Most garbage one input may carry. A well is `TOTAL_HEIGHT` rows, so this
 * many lines already kills any board; anything larger is not a bigger attack,
 * only a longer loop. The number arrives from a peer (an `attack` event, or a
 * checkpoint's input log that every client replays), so without a ceiling one
 * event could pin every tab in the channel.
 */
export const MAX_GARBAGE_LINES = TOTAL_HEIGHT;
