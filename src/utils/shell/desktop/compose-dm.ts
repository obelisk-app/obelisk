/** The highlighted row, kept on the list as it shrinks under the cursor. */
export function clampActiveIndex(active: number, count: number): number {
  return Math.min(active, Math.max(0, count - 1));
}

/** What a key does in the compose search box, or `null` to let it type. */
export type ComposeDmKeyAction =
  | { kind: 'close' }
  | { kind: 'highlight'; index: number }
  | { kind: 'pick'; index: number };

export function composeDmKeyAction(key: string, selected: number, count: number): ComposeDmKeyAction | null {
  if (key === 'Escape') return { kind: 'close' };
  if (key === 'ArrowDown' && count > 0) return { kind: 'highlight', index: (selected + 1) % count };
  if (key === 'ArrowUp' && count > 0) return { kind: 'highlight', index: (selected - 1 + count) % count };
  if (key === 'Enter' && selected < count) return { kind: 'pick', index: selected };
  return null;
}
