import type { Event as NostrEvent } from 'nostr-tools/pure';
import type { UserHit } from '@/constants/identity/user-search';
import { KIND_METADATA } from '@/constants/nostr/nip-kinds';
import { safeJsonParse } from '@/utils/storage/json-safe';

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Untrusted kind-0 JSON becomes only the text fields a search row can render. */
function profileHit(event: NostrEvent): UserHit {
  const value = safeJsonParse<unknown>(event.content, null);
  const data = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  return {
    pubkey: event.pubkey,
    displayName: text(data.displayName) ?? text(data.display_name) ?? text(data.name),
    picture: text(data.picture) ?? text(data.image),
    nip05: text(data.nip05),
  };
}

/** One current profile per person, keeping search order and omitting the direct NIP-05 match. */
export function userSearchHits(events: readonly NostrEvent[], resolvedPubkey?: string): UserHit[] {
  const latest = new Map<string, NostrEvent>();
  for (const event of events) {
    if (event.kind !== KIND_METADATA || event.pubkey === resolvedPubkey) continue;
    const previous = latest.get(event.pubkey);
    if (!previous || event.created_at > previous.created_at) latest.set(event.pubkey, event);
  }
  return [...latest.values()].slice(0, 10).map(profileHit);
}
