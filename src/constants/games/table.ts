/**
 * Games: table. Values the code in
 * `hooks/games/table/useFullscreenBoardBox.ts`,
 * `hooks/games/table/useGameTableModal.ts`,
 * `hooks/games/table/useResultSplash.ts`,
 * `utils/games/table/fullscreen-default.ts` reads, kept here so every reader
 * imports the one copy.
 */

/**
 * The room a fullscreen board actually gets.
 *
 * Turn-based boards used to take a width cap and nothing else, so fullscreen
 * on Chain Reaction was a 264px board adrift in a 1440px window: the cell
 * size was capped and there was no height to fill. Measuring here keeps the
 * board component free of window queries, the same way StackerTable already
 * sizes its own cells.
 *
 * The subtraction is the chrome above and below: title row, turn clock,
 * seat legend, and the action buttons. The title row is the shared
 * ModalHeader since round 27: 65px (py-3, a 24px title over a 16px status
 * line, the hairline) plus the body's 12px top padding, where the old
 * hand-built row took 60.5px (12px panel padding, 20px title over a 16.5px
 * status line, a 12px gap). So 210 became 227 (16.5 rounded up).
 */
export const FULLSCREEN_CHROME_PX = 227;

/** Board width when the table is a dialog rather than fullscreen. */
export const DIALOG_BOARD_WIDTH = 420;

/**
 * How long the result splash waits before covering the board.
 *
 * The deciding move is the biggest cascade in the game and it arrives in the
 * same event that ends the match, so a splash that renders immediately hides
 * the only explosion anybody wanted to watch. The board reports when it is
 * animating (`onRevealChange`); this short delay covers the gap between the
 * finished session landing and the board starting to play it back.
 */
export const RESULT_SPLASH_DELAY_MS = 300;

/** …and a ceiling, so a board that never reports "done" cannot eat the splash. */
export const RESULT_SPLASH_MAX_WAIT_MS = 6000;

/** Below this window width a table opens fullscreen. */
export const FULLSCREEN_BELOW_PX = 768;
