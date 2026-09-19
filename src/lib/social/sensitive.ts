/**
 * Sensitive-content detection (NIP-36) with the quirks the three major
 * clients actually exhibit.
 *
 * Findings that shape this file (verified against client sources):
 *
 *  - **Amethyst** is the only one of the three that implements NIP-36. Its
 *    "mark sensitive" toggle emits `["content-warning", ""]` — a two-element
 *    tag with an EMPTY reason — so a reader must not assume `tag[1]` exists
 *    or is meaningful. The bare one-element `["content-warning"]` also occurs.
 *  - **Damus and Primal ignore `content-warning` entirely.** The only signal
 *    that reaches a Damus user is the `#nsfw` hashtag. So when we publish a
 *    warning we also add `["t","nsfw"]`, or Damus readers get no warning at
 *    all.
 *  - Amethyst additionally reads `nsfw`/`nude` hashtags, and supports a
 *    per-image `content-warning` inside an `imeta` tag.
 *  - NIP-32 `L`/`l` labels are NOT read for this by any major client, so we
 *    don't write them — but we tolerate them on read.
 */

import type { Event as NostrEvent } from 'nostr-tools';

/** Hashtags that mean "sensitive" to Amethyst and Damus. */
const SENSITIVE_HASHTAGS = new Set(['nsfw', 'nude', 'nudity', 'gore']);

export type SensitiveInfo = {
  sensitive: boolean;
  /** Human-readable reason, when one was supplied. Empty reasons → null. */
  reason: string | null;
};

export function sensitiveInfo(note: Pick<NostrEvent, 'tags'>): SensitiveInfo {
  let sensitive = false;
  let reason: string | null = null;

  for (const tag of note.tags) {
    if (tag[0] === 'content-warning') {
      sensitive = true;
      // Tolerate both `["content-warning"]` and `["content-warning",""]`.
      const value = tag[1]?.trim();
      if (value && !reason) reason = value;
      continue;
    }
    if (tag[0] === 't' && tag[1] && SENSITIVE_HASHTAGS.has(tag[1].toLowerCase())) {
      sensitive = true;
      continue;
    }
    // NIP-32 label form, read-only tolerance.
    if (tag[0] === 'l' && tag[2] === 'content-warning') {
      sensitive = true;
      if (tag[1]?.trim() && !reason) reason = tag[1].trim();
    }
  }

  return { sensitive, reason };
}

/**
 * Tags to publish alongside a note the author marked sensitive.
 *
 * Always emits a reason (never the bare one-element form — it costs nothing
 * and reads better everywhere), and always adds the `nsfw` hashtag so Damus
 * users get some signal, since Damus has no NIP-36 support at all.
 */
export function contentWarningTags(reason: string, existingTags: readonly string[][] = []): string[][] {
  const tags: string[][] = [['content-warning', reason.trim() || 'sensitive content']];
  const hasNsfw = existingTags.some(
    (tag) => tag[0] === 't' && tag[1]?.toLowerCase() === 'nsfw',
  );
  if (!hasNsfw) tags.push(['t', 'nsfw']);
  return tags;
}
