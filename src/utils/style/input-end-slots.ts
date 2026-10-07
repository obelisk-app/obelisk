/** How many controls an Input's end slot will hold (spinner, clear, reveal, suffix), so the input can pad for them. */
export function endSlotCount(parts: { loading: boolean; clear: boolean; secret: boolean; suffix: boolean }): number {
  return Number(parts.loading) + Number(parts.clear) + Number(parts.secret) + Number(parts.suffix);
}
