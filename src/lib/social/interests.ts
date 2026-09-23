'use client';

/**
 * Following hashtags, the way the rest of Nostr already does it.
 *
 * NIP-51 defines kind 10015, "Interests": a replaceable list whose `t` tags
 * are the hashtags you follow. Amethyst, Primal and Coracle all read and
 * write it, so a tag followed here shows up in those clients' feeds and
 * vice-versa. That interop is the entire reason not to invent a local list —
 * a private "followed tags" array in `localStorage` would be invisible to
 * every other client and lost on every new device.
 *
 * Scope note: only the public half is implemented. NIP-51 also allows
 * private entries, NIP-44-encrypted into `content`, and kind 30015 "interest
 * sets" referenced by `a` tags. Both are read-through-compatible — an event
 * we write preserves tags we don't understand — but neither is authored
 * here, and `content` is carried across untouched so a list with private
 * entries written elsewhere survives a follow made from Obelisk.
 */

import type { Event as NostrEvent } from 'nostr-tools';
import { getBridge } from '../nostr-bridge';
import { querySocial, socialRelays } from './pool';

/** NIP-51 interests list. Replaceable, one per author. */
export const KIND_INTERESTS = 10015;

/**
 * Hashtags are compared and stored lowercase and without the leading `#`.
 *
 * Relays index `t` tags verbatim, so `#Bitcoin` and `#bitcoin` are different
 * filter values — publishing mixed case means a feed that silently misses
 * most of the tag's traffic. Every client that matters lowercases on write.
 */
export function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#+/, '').toLowerCase();
}

/** The hashtags in an interests event, deduped and normalised. */
export function interestsFrom(event: NostrEvent | null | undefined): string[] {
  if (!event) return [];
  const seen = new Set<string>();
  for (const tag of event.tags) {
    if (tag[0] !== 't' || !tag[1]) continue;
    const value = normalizeTag(tag[1]);
    if (value) seen.add(value);
  }
  return [...seen];
}

/** The author's interests list, or null when they have never published one. */
export async function fetchInterests(
  pubkey: string,
  opts: { relays?: readonly string[] } = {},
): Promise<NostrEvent | null> {
  const events = await querySocial(
    [{ kinds: [KIND_INTERESTS], authors: [pubkey], limit: 1 } as never],
    opts.relays ? { relays: opts.relays } : undefined,
  );
  // Replaceable: newest wins, and relays are not obliged to agree.
  return events
    .filter((event) => event.kind === KIND_INTERESTS && event.pubkey === pubkey)
    .sort((a, b) => b.created_at - a.created_at)[0] ?? null;
}

/**
 * Rewrite the list with `tags` as its hashtags, preserving everything else.
 *
 * The non-`t` tags are carried over untouched because an interests list may
 * hold `a` pointers to interest sets that this client does not author —
 * dropping them would silently unfollow whole sets the user curated
 * elsewhere. `content` is preserved for the same reason: it may hold
 * NIP-44-encrypted private entries we cannot read and must not discard.
 */
export function buildInterestsEvent(
  previous: NostrEvent | null,
  tags: readonly string[],
): { kind: number; content: string; tags: string[][]; created_at: number } {
  const kept = (previous?.tags ?? []).filter((tag) => tag[0] !== 't');
  const seen = new Set<string>();
  const tTags: string[][] = [];
  for (const raw of tags) {
    const value = normalizeTag(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    tTags.push(['t', value]);
  }
  return {
    kind: KIND_INTERESTS,
    content: previous?.content ?? '',
    tags: [...kept, ...tTags],
    // A replaceable event that is not strictly newer is discarded by relays,
    // and a clock behind the last write would make the change vanish.
    created_at: Math.max(Math.floor(Date.now() / 1000), (previous?.created_at ?? 0) + 1),
  };
}

/** Publish the list. Social relays only — this is ordinary Nostr, not group state. */
export async function publishInterests(
  previous: NostrEvent | null,
  tags: readonly string[],
): Promise<void> {
  const bridge = await getBridge();
  await bridge.publishEvent(buildInterestsEvent(previous, tags), {
    extraRelays: socialRelays(),
    mode: 'replace',
  });
}

/** `tags` with `tag` added or removed, whichever it wasn't. */
export function toggleInterest(tags: readonly string[], tag: string): string[] {
  const value = normalizeTag(tag);
  if (!value) return [...tags];
  const current = tags.map(normalizeTag);
  return current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
}
