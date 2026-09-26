/**
 * NIP-92 `imeta` — reading and writing media metadata.
 *
 * Two findings from the major clients shape this file:
 *
 * **Parsing must be `split(' ', limit 2)` over a multimap.** Values contain
 * spaces (`alt`, `content-warning`) and keys repeat (`fallback`). Damus's
 * parser does `part.split(" ")` and bails on the whole tag unless it gets
 * exactly two tokens — which means the NIP-92 spec's own example event is
 * discarded wholesale by Damus. We do not copy that bug.
 *
 * **Writing `alt` has a real cost.** Because of the Damus parser above, any
 * imeta tag carrying multi-word alt text loses its `dim` and `blurhash` for
 * Damus readers, degrading to a layout-shifting unsized image. We still write
 * `alt` when the author supplied one — accessibility wins, and the field is
 * usually absent — but the ordering puts the cheap machine-readable fields
 * first so the intent is clear.
 *
 * Kind 1063 (NIP-94) is deliberately not used for kind-1 media: NIP-94 itself
 * says social clients aren't expected to implement it, and `imeta` exists so
 * they don't have to.
 */

import type { Event as NostrEvent } from 'nostr-tools';

export type ImetaFields = {
  url: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  sha256: string | null;
  alt: string | null;
  contentWarning: string | null;
  fallbacks: string[];
  /**
   * NIP-71 poster frame. A video with no poster renders as a grey box
   * reading `0:00` — there is nothing to look at until you press play, so
   * a video note in a feed says nothing about itself. Publishers write
   * either `image` (NIP-71's name) or `thumb`; take whichever is there.
   */
  poster: string | null;
  /** NIP-71 `duration`, in seconds. */
  durationSec: number | null;
};

/**
 * Parse one `imeta` tag into fields. Tolerant by design — a malformed entry
 * is skipped rather than invalidating the tag.
 */
export function parseImetaTag(tag: readonly string[]): ImetaFields | null {
  const multi = new Map<string, string[]>();
  for (const part of tag.slice(1)) {
    if (typeof part !== 'string') continue;
    const space = part.indexOf(' ');
    if (space <= 0) continue;
    const key = part.slice(0, space);
    const value = part.slice(space + 1).trim();
    if (!value) continue;
    const bucket = multi.get(key);
    if (bucket) bucket.push(value);
    else multi.set(key, [value]);
  }

  const url = multi.get('url')?.[0];
  if (!url) return null;

  const dim = multi.get('dim')?.[0];
  const [width, height] = dim
    ? dim.split('x').map((n) => {
      const parsed = Number.parseInt(n, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    })
    : [null, null];

  return {
    url,
    mimeType: multi.get('m')?.[0] ?? null,
    width: width ?? null,
    height: height ?? null,
    blurhash: multi.get('blurhash')?.[0] ?? null,
    sha256: multi.get('x')?.[0] ?? null,
    alt: multi.get('alt')?.[0] ?? null,
    // Amethyst's per-image content warning. Not in any NIP, but it's the only
    // way a multi-image post can gate one image and not the rest.
    contentWarning: multi.get('content-warning')?.[0] ?? null,
    fallbacks: multi.get('fallback') ?? [],
    poster: multi.get('image')?.[0] ?? multi.get('thumb')?.[0] ?? null,
    durationSec: parsePositiveInt(multi.get('duration')?.[0]),
  };
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** All imeta entries on a note, keyed by URL. */
export function parseImeta(note: Pick<NostrEvent, 'tags'>): Map<string, ImetaFields> {
  const byUrl = new Map<string, ImetaFields>();
  for (const tag of note.tags) {
    if (tag[0] !== 'imeta') continue;
    const fields = parseImetaTag(tag);
    // "There SHOULD be only one imeta tag per URL" — first wins.
    if (fields && !byUrl.has(fields.url)) byUrl.set(fields.url, fields);
  }
  return byUrl;
}

/** Aspect ratio for reserving layout space before the image loads. */
export function aspectRatio(fields: Pick<ImetaFields, 'width' | 'height'>): number | null {
  return fields.width && fields.height ? fields.width / fields.height : null;
}
