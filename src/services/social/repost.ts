/**
 * Resolving kind-6 / kind-16 reposts to the note they wrap.
 *
 * A repost is a wrapper, not content: rendering its `content` as text shows
 * the reader a wall of raw JSON. The target has to be resolved and rendered
 * with a "X reposted" attribution.
 *
 * Two resolution paths, because publishers disagree:
 *  - `content` holds the stringified original (what NIP-18 recommends, and
 *    what Primal/Damus expect): parse it, no network needed.
 *  - `content` is empty (spec-legal): fall back to the `e` tag and fetch.
 *    Primal has a dedicated "empty repost" rescue path for exactly this, so
 *    it is common enough to matter.
 */

import { registerRuntimeCache } from '@/services/local-data/runtime-caches';
import type { Event as NostrEvent } from 'nostr-tools';
import { validateEvent, verifyEvent } from 'nostr-tools/pure';
import { fetchNote } from '@nostr-wot/data';
import { KIND_GENERIC_REPOST, KIND_TEXT_NOTE, KIND_REPOST } from '@/constants/nostr/nip-kinds';

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
  if (note.kind === KIND_REPOST) return KIND_TEXT_NOTE;
  const k = note.tags.find((t) => t[0] === 'k' && !!t[1])?.[1];
  const parsed = k ? Number.parseInt(k, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Verified parses of repost `content`, keyed on the content string.
 *
 * The embedded event never crossed a relay subscription, so the pool's
 * `verifyEvent` never saw it: this is the one place it gets checked. A
 * schnorr verification costs ~1.7ms (measured, @noble/curves in Node), and
 * `groupReposts` re-runs over the whole window every time a page lands, so
 * the result is memoised here rather than per card. Bounded FIFO: the keys
 * are the notes' own content strings, so a full cache holds roughly one
 * feed window's worth of reposts (`FEED_MAX_NOTES` is 500).
 */
const EMBED_CACHE_MAX = 1000;
const verifiedEmbeds = new Map<string, NostrEvent | null>();
registerRuntimeCache({
  id: 'verified-reposts', category: 'channels', scope: 'public', sensitive: false,
  inspect: () => ({ entries: verifiedEmbeds.size }), invalidate: () => verifiedEmbeds.clear(),
});

function parseVerifiedEmbed(raw: string): NostrEvent | null {
  const hit = verifiedEmbeds.get(raw);
  if (hit !== undefined) return hit;

  let result: NostrEvent | null = null;
  try {
    const parsed: unknown = JSON.parse(raw);
    // `validateEvent` checks the shape (hex pubkey, string tags, …);
    // `verifyEvent` recomputes the id from the content and checks the
    // signature against it, so a correct signature over a *different* id
    // fails too. Both come from nostr-tools/pure. JSON cannot carry the
    // `verifiedSymbol` memo, so a blob cannot pre-mark itself verified.
    if (
      validateEvent(parsed)
      && typeof (parsed as { id?: unknown }).id === 'string'
      && typeof (parsed as { sig?: unknown }).sig === 'string'
      && verifyEvent(parsed as NostrEvent)
    ) {
      result = parsed as NostrEvent;
    }
  } catch {
    // Some clients put a plain comment in a repost's content. Not fatal:
    // fall through to the e-tag path.
    result = null;
  }

  if (verifiedEmbeds.size >= EMBED_CACHE_MAX) {
    const oldest = verifiedEmbeds.keys().next().value;
    if (oldest !== undefined) verifiedEmbeds.delete(oldest);
  }
  verifiedEmbeds.set(raw, result);
  return result;
}

/**
 * Parse the embedded original out of `content`, if it's there, signed by
 * the pubkey it claims, and consistent with the wrapper.
 *
 * Returns null when the blob fails verification, so the caller falls
 * through to the `e`-tag path, where the note is fetched by id through the
 * pool and verified there. That is the failure mode on purpose: a repost
 * whose `content` is forged still names a real note in its `e` tag, and
 * showing *that* (or a button to open it) is better for the reader than a
 * blank row or a card that says "could not verify" while still attributing
 * the forged text to someone.
 *
 * Consistency, beyond the signature:
 *  - when the wrapper has an `e` tag, the embedded id must match it;
 *  - a kind-6 must wrap a kind 1 (NIP-18); a kind-16's `k` tag, when
 *    present, must match the inner kind.
 * Neither is an impersonation vector once the signature holds (the content
 * is the real author's), but an inconsistent wrapper would render the inner
 * event under the wrong mode and collapse into the wrong feed row.
 */
export function embeddedRepostEvent(
  note: Pick<NostrEvent, 'content' | 'kind' | 'tags'>,
): NostrEvent | null {
  const raw = note.content?.trim();
  if (!raw) return null;
  const inner = parseVerifiedEmbed(raw);
  if (!inner) return null;

  const target = repostTarget(note);
  if (target && target.id !== inner.id) return null;

  const expectedKind = repostInnerKind(note);
  if (expectedKind !== null && inner.kind !== expectedKind) return null;
  return inner;
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
    kind: KIND_TEXT_NOTE,
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
 * reposted this" rendered as one anonymous row: the count, which is the
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

    // Already represented, by the original, or by an earlier repost row.
    if (originals.has(targetId) || rowForTarget.has(targetId)) continue;

    rowForTarget.set(targetId, out.length);
    out.push(note);
  }

  return { notes: out, repostersByTarget };
}

/**
 * Back-compat shim for callers that only want the collapsed list.
 * Prefer `groupReposts`: the reposter counts are the interesting part.
 */
export function dedupeReposts(notes: readonly NostrEvent[]): NostrEvent[] {
  return groupReposts(notes).notes;
}
