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

/** The note a repost row stands for, whether embedded or referenced. */
function targetIdOf(note: NostrEvent): string | null {
  return repostTarget(note)?.id ?? embeddedRepostEvent(note)?.id ?? null;
}

export type GroupedFeed = {
  notes: NostrEvent[];
  /** Target note id → reposter pubkeys, newest repost first. */
  repostersByTarget: Map<string, string[]>;
};

/**
 * Collapse repeat reposts of the same note into one row, keeping who did it.
 *
 * The previous version threw duplicates away, so "eight people you follow
 * reposted this" rendered as one anonymous row — the count, which is the
 * whole signal a repost carries, was discarded.
 *
 * Two collapses happen here:
 *  - repost vs repost, keyed on the *target* rather than the repost id
 *    (Amethyst does the same), so a popular note doesn't occupy eight
 *    consecutive rows;
 *  - repost vs **original**: if the note itself is in the window, the
 *    original wins the row and the reposters are recorded against it.
 *    Without this a note you already had appeared twice, once on its own and
 *    once wrapped.
 *
 * Input order is assumed newest-first (as `mergeNotes` leaves it), which is
 * what makes the reposter lists newest-first too.
 */
export function groupReposts(notes: readonly NostrEvent[]): GroupedFeed {
  const repostersByTarget = new Map<string, string[]>();
  // Originals present in the window, so a repost of one can defer to it.
  const originals = new Set<string>();
  for (const note of notes) {
    if (!isRepost(note)) originals.add(note.id);
  }

  const out: NostrEvent[] = [];
  const rowForTarget = new Map<string, number>();

  for (const note of notes) {
    if (!isRepost(note)) {
      out.push(note);
      continue;
    }
    const targetId = targetIdOf(note);
    if (!targetId) {
      // A repost we can't resolve is still a row; dropping it loses content.
      out.push(note);
      continue;
    }

    const reposters = repostersByTarget.get(targetId) ?? [];
    // De-duped: one person reposting twice is one voucher, not two.
    if (!reposters.includes(note.pubkey)) reposters.push(note.pubkey);
    repostersByTarget.set(targetId, reposters);

    // Already represented — by the original, or by an earlier repost row.
    if (originals.has(targetId) || rowForTarget.has(targetId)) continue;

    rowForTarget.set(targetId, out.length);
    out.push(note);
  }

  return { notes: out, repostersByTarget };
}

/**
 * Back-compat shim for callers that only want the collapsed list.
 * Prefer `groupReposts` — the reposter counts are the interesting part.
 */
export function dedupeReposts(notes: readonly NostrEvent[]): NostrEvent[] {
  return groupReposts(notes).notes;
}
