/**
 * Helpers for the migration tests: write a saved blob exactly the way an
 * older build left it in localStorage, and read back what is there now.
 */
export interface SavedBlob {
  readonly state: Record<string, unknown>;
  readonly version: number;
}

/** Store `state` under `key` with `version`, the `{ state, version }` envelope zustand writes. */
export function seedBlob(key: string, state: unknown, version: number): void {
  localStorage.setItem(key, JSON.stringify({ state, version }));
}

export function readBlob(key: string): SavedBlob | null {
  const raw = localStorage.getItem(key);
  return raw === null ? null : (JSON.parse(raw) as SavedBlob);
}

let seq = 0;
/** A pubkey no other test has used: the per-account ensure is a no-op for the account it already points at. */
export function freshPubkey(): string {
  return `f${++seq}`.padEnd(64, '0');
}

/** Garbage a saved blob can hold after a bug, a manual edit or a newer build. Each must load as the defaults. */
export const CORRUPT_STATES: ReadonlyArray<readonly [label: string, state: unknown, version: number]> = [
  ['a string instead of state', 'garbage', 0],
  ['an array instead of state', [1, 2, 3], 0],
  ['null state', null, 1],
  ['a version from a newer build', {}, 99],
  ['a fractional version', {}, 0.5],
];
