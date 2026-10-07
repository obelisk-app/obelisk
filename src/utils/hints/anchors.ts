import { hintForAnchor } from '@/utils/hints/registry';

/**
 * The mounted, laid-out element a hint points at, or null. `offsetParent
 * === null` catches `display: none` and the responsive variants that hide a
 * control on one shell but not the other.
 */
export function findHintAnchor(anchor: string): HTMLElement | null {
  const found = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
  return found && found.offsetParent !== null ? found : null;
}

/** The hint id taught by a press on `target`: the one for its nearest `[data-tour]`. */
export function hintTaughtBy(target: EventTarget | null): string | undefined {
  const tour = (target as HTMLElement | null)?.closest?.('[data-tour]');
  const anchor = tour?.getAttribute('data-tour');
  return anchor ? hintForAnchor(anchor)?.id : undefined;
}
