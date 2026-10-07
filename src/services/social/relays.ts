/**
 * Social relay set: the FOURTH relay tier in this app.
 *
 * Obelisk already juggles three relay tiers (see AGENTS.md "Single-relay
 * rule"): NIP-29 group relays, profile-lookup relays, and DM (NIP-65) relays.
 * "Social" is a fourth, and it must not be confused with any of them:
 *
 *   - Group relays serve kinds 9 / 39000-39002 and are whitelist-gated.
 *   - Social relays serve ordinary Nostr traffic (kind 1 and friends) and are
 *     public.
 *
 * The read-side rule, now that every SDK read rides the RelayHub's sockets
 * (`pool.ts`): reads may use any relay that already holds a live lease.
 * Never open a socket to a configured relay solely to serve a lookup; if no
 * lease exists, fall back to the public lookup relays. `leasedRelays()` in
 * `pool.ts` is the filter that applies it. The rule used to forbid the
 * social path from touching `useConfiguredRelays()` at all, because the SDK
 * pool had no `automaticallyAuth` and a whitelist-gated relay answered its
 * second, unauthenticated socket with the `Tried to send AUTH on a closed
 * connection` loop; one AUTH-capable socket per relay and identity removes
 * that reason, and the lease keeps the privacy half: an idle configured
 * relay gets no socket and no AUTH for a lookup's sake.
 *
 * This module replaces the old `profileFeedRelays` contract, which hard-locked
 * the user to EXACTLY three relays: `parseProfileFeedRelays` returned `null`
 * for any other count, so there was no way to add a fourth or drop to two.
 */

import {
  SOCIAL_RELAY_MIN,
  SOCIAL_RELAY_MAX,
  DEFAULT_SOCIAL_RELAYS,
  WIDER_SOCIAL_RELAYS,
} from '@/constants/social/relays';
import { normalizeRelayUrl } from '@/utils/social/relay-url';

/** The user's relays plus the fallback set, deduped. */
export function widenedRelays(relays: readonly string[]): string[] {
  return [...new Set([...relays, ...WIDER_SOCIAL_RELAYS])];
}

/**
 * Relays offered as one-click additions in settings.
 *
 * The relay list started as four text boxes you had to fill from memory,
 * which is a fine interface for someone who already knows four relay
 * hostnames and a dead end for everyone else; the most common reason a
 * feed looks empty is a relay set nobody ever chose. These are the
 * well-known public ones, each with a note saying what it is for, because
 * "add another relay" is only useful advice if you know which.
 *
 * `note` is an i18n key suffix under `preferences.socialRelays.preset.*`,
 * not copy: the list is data and has to survive translation.
 */
export interface RelayPreset {
  url: string;
  note: 'general' | 'index' | 'search' | 'paid' | 'profiles';
}

/**
 * Coerce arbitrary persisted/user input into a usable relay list.
 *
 * Unlike the old exactly-three rule this never rejects wholesale: invalid
 * entries are dropped individually and the rest are kept, because throwing
 * away a user's seven good relays because the eighth had a typo is worse
 * than the typo. Falls back to defaults only when nothing survives.
 */
export function normalizeSocialRelays(value: unknown): string[] {
  const input = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  for (const entry of input) {
    const relay = normalizeRelayUrl(entry);
    if (relay) seen.add(relay);
    if (seen.size >= SOCIAL_RELAY_MAX) break;
  }
  return seen.size >= SOCIAL_RELAY_MIN ? [...seen] : [...DEFAULT_SOCIAL_RELAYS];
}

/** Which entries of a draft list are invalid, for inline form feedback. */
export function invalidRelayIndexes(draft: readonly string[]): number[] {
  const bad: number[] = [];
  draft.forEach((entry, index) => {
    if (entry.trim() && !normalizeRelayUrl(entry)) bad.push(index);
  });
  return bad;
}

/**
 * Stable cache-namespace key for a relay set.
 *
 * The bridgeCache is keyed by relay, and notes read from one relay set must
 * not be served to another; otherwise switching relays paints stale content
 * that the new set may not even carry. Sorted so member order doesn't matter.
 */
export function socialRelayKey(relays: readonly string[]): string {
  return `social:${[...relays].sort().join(',')}`;
}
