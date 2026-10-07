/** A relay address a call can be set up on: `wss://`, with no user name or password in it. */
export function isWssRelay(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'wss:' && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** A typed row to mark red: something is there and it is not a usable relay. */
export function isBadRelayDraft(value: string): boolean {
  return value.trim() !== '' && !isWssRelay(value);
}

/** The relays a draft would save (blank rows dropped), or null when it is empty or holds an unusable address. */
export function callRelaysToSave(draft: readonly string[]): string[] | null {
  const filled = draft.map((r) => r.trim()).filter(Boolean);
  if (filled.length === 0 || filled.some((r) => !isWssRelay(r))) return null;
  return filled;
}
