import { parseRelayUrl } from '@nostr-wot/relay';

/** Encrypted call relay without embedded credentials. */
export function isWssRelay(value: string): boolean {
  return parseRelayUrl(value) !== null;
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
