/**
 * How tall an auto-sizing textarea should be for its content, capped at a
 * number of rows (`useAutosizeTextArea` measures, this decides).
 */
export interface AutosizeMeasure {
  scrollHeight: number;
  lineHeight: number;
  /** Vertical padding plus borders, which `scrollHeight` leaves out of the border box. */
  paddingY: number;
  borderY: number;
  maxRows?: number;
}

/**
 * The border-box height that shows every line, capped at `maxRows` lines,
 * and whether the text overflows that cap (so the box should scroll).
 */
export function autosizeHeight({ scrollHeight, lineHeight, paddingY, borderY, maxRows }: AutosizeMeasure): { height: number; overflow: boolean } {
  const content = scrollHeight + borderY;
  if (maxRows === undefined) return { height: content, overflow: false };
  const cap = lineHeight * maxRows + paddingY + borderY;
  return content > cap ? { height: cap, overflow: true } : { height: content, overflow: false };
}
