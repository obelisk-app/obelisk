/** A draft row's key into the status map: trimmed, without a trailing slash. */
export function relayKey(entry: string): string {
  return entry.trim().replace(/\/$/, '');
}

export interface SocialRelayPresetChip {
  url: string;
  /** The address without its `wss://`. */
  host: string;
  note: string;
  /** Already in the draft (a trailing slash does not count). */
  added: boolean;
  disabled: boolean;
}

/**
 * The suggested relays as chips: each marked once the draft holds it, and
 * disabled when it is there already or the list is full with no blank row
 * waiting for it.
 */
export function socialRelayPresetChips<N extends string>(
  presets: ReadonlyArray<{ url: string; note: N }>,
  draft: ReadonlyArray<string>,
  canAdd: boolean,
): Array<SocialRelayPresetChip & { note: N }> {
  const hasBlank = draft.some((entry) => !entry.trim());
  return presets.map((preset) => {
    const added = draft.some((entry) => relayKey(entry) === preset.url);
    return {
      url: preset.url,
      host: preset.url.replace(/^wss:\/\//, ''),
      note: preset.note,
      added,
      disabled: added || (!canAdd && !hasBlank),
    };
  });
}
