export type ModerationKind = 'mute' | 'block';

export interface ModerationEntry { pubkey: string; kind: ModerationKind }

/** The people muted, then the people blocked, as one list of rows. */
export function moderationEntries(muted: readonly string[], blocked: readonly string[]): ModerationEntry[] {
  return [
    ...muted.map((pubkey) => ({ pubkey, kind: 'mute' as const })),
    ...blocked.map((pubkey) => ({ pubkey, kind: 'block' as const })),
  ];
}

/** A row's React key: a person can be both muted and blocked. */
export function moderationEntryKey(entry: ModerationEntry): string {
  return `${entry.kind}:${entry.pubkey}`;
}
