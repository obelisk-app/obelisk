/**
 * Resolving kind-6 / kind-16 reposts to the note they wrap.
 *
 * A repost is a wrapper, not content: rendering its `content` as text shows
 * the reader a wall of raw JSON. The target has to be resolved and rendered
 * with a "X reposted" attribution.
 *
 * Two resolution paths, because publishers disagree:
 *  - `content` holds the stringified original (what NIP-18 recommends, and
 *    what Primal/Damus expect) — parse it, no network needed.
 *  - `content` is empty (spec-legal) — fall back to the `e` tag and fetch.
 *    Primal has a dedicated "empty repost" rescue path for exactly this, so
 *    it is common enough to matter.
 */

import type { Event as NostrEvent } from 'nostr-tools';
import { fetchNote } from '@nostr-wot/data';
import { KIND_GENERIC_REPOST, KIND_NOTE, KIND_REPOST } from './kinds';

export function isRepost(note: Pick<NostrEvent, 'kind'>): boolean {
  return note.kind === KIND_REPOST || note.kind === KIND_GENERIC_REPOST;
}

/** The `e` tag a repost points at, with its relay hint if present. */
export function repostTarget(
  note: Pick<NostrEvent, 'tags'>,
): { id: string; relayHint: string | null; author: string | null } | null {
  const tag = note.tags.find((t) => t[0] === 'e' && !!t[1]);
  if (!tag) return null;
  const author = note.tags.find((t) => t[0] === 'p' && !!t[1])?.[1] ?? null;
  return { id: tag[1], relayHint: tag[2] || null, author };
}

/**
 * The inner kind, without fetching. kind-16 carries a `k` tag precisely so a
 * reader can decide whether it can render the target before going to the
 * network.
 */
export function repostInnerKind(note: Pick<NostrEvent, 'kind' | 'tags'>): number | null {
  if (note.kind === KIND_REPOST) return KIND_NOTE;
  const k = note.tags.find((t) => t[0] === 'k' && !!t[1])?.[1];
  const parsed = k ? Number.parseInt(k, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/** Parse the embedded original out of `content`, if it's there and valid. */
export function embeddedRepostEvent(note: Pick<NostrEvent, 'content'>): NostrEvent | null {
  const raw = note.content?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as NostrEvent;
    return parsed && typeof parsed.id === 'string' && typeof parsed.pubkey === 'string'
      ? parsed
      : null;
  } catch {
    // Some clients put a plain comment in a repost's content. Not fatal —
    // fall through to the e-tag path.
    return null;
  }
}

/** Embedded first, network second. Returns null when the target is lost. */
export async function resolveRepost(note: NostrEvent): Promise<NostrEvent | null> {
  const embedded = embeddedRepostEvent(note);
  if (embedded) return embedded;
  const target = repostTarget(note);
  if (!target) return null;
  const fetched = await fetchNote(target.id, target.relayHint ? [target.relayHint] : undefined);
  if (!fetched) return null;
  return {
    id: fetched.id,
    pubkey: fetched.pubkey,
    content: fetched.content,
    created_at: fetched.createdAt,
    tags: fetched.tags,
    kind: KIND_NOTE,
    sig: '',
  };
}

/**
 * Collapse repeat reposts of the same note, keeping the most recent.
 *
 * Amethyst does this (`distinctBy` on the repost *target* rather than the
 * repost id) and it matters: without it, a popular note reposted by eight
 * people you follow occupies eight consecutive rows.
 */
export function dedupeReposts(notes: readonly NostrEvent[]): NostrEvent[] {
  const seenTargets = new Set<string>();
  const out: NostrEvent[] = [];
  for (const note of notes) {
    if (!isRepost(note)) {
      out.push(note);
      continue;
    }
    const targetId = repostTarget(note)?.id ?? embeddedRepostEvent(note)?.id;
    if (!targetId) {
      out.push(note);
      continue;
    }
    if (seenTargets.has(targetId)) continue;
    seenTargets.add(targetId);
    out.push(note);
  }
  return out;
}
