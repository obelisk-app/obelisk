/**
 * Every social write, in one place, with the wire format other clients expect.
 *
 * This file is the single source of truth for tag shapes. If Primal, Amethyst
 * or Damus render something from Obelisk in the wrong place, the bug is here
 * — and `publish.test.ts` asserts these shapes exactly, because a malformed
 * reply tag is invisible locally and only shows up as a thread that other
 * clients scatter.
 *
 * Relay scope: social events go out with `mode: 'replace'` against the social
 * relay set. `'merge'` (the default) would union in `this.relays` — the active
 * NIP-29 group relay — and leak kind-1 traffic onto a group relay that has no
 * business carrying it. See CLAUDE.md "Single-relay rule".
 */

import type { Event as NostrEvent } from 'nostr-tools';
import { getBridge } from '../nostr-bridge';
import { KIND_TEXT_NOTE } from '../nip-kinds';
import { hashtagTags } from '../profile-feed';
import { encodeEventRef, mentionedPubkeys, referencedEvents } from './nip27';
import { socialRelays } from './pool';

export const KIND_REPOST = 6;
export const KIND_REACTION = 7;
export const KIND_DELETE = 5;

export type Attachment = {
  url: string;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  sha256?: string | null;
  alt?: string | null;
};

async function publish(
  template: { kind: number; content: string; tags: string[][] },
): Promise<NostrEvent> {
  const bridge = await getBridge();
  return bridge.publishEvent(template, {
    extraRelays: socialRelays(),
    mode: 'replace',
  });
}

/**
 * NIP-92 `imeta`. One tag per attachment, space-delimited `key value` pairs
 * inside a single tag array. Amethyst and Primal use `dim`/`blurhash` to
 * reserve layout space before the image loads, which is why a feed that omits
 * imeta visibly janks in those clients.
 *
 * The bare URL stays in `content` regardless — that is still the universal
 * read path for every client that doesn't parse imeta.
 */
export function imetaTag(attachment: Attachment): string[] {
  const parts = [`url ${attachment.url}`];
  if (attachment.mimeType) parts.push(`m ${attachment.mimeType}`);
  if (attachment.width && attachment.height) {
    parts.push(`dim ${attachment.width}x${attachment.height}`);
  }
  if (attachment.sha256) parts.push(`x ${attachment.sha256}`);
  if (attachment.alt) parts.push(`alt ${attachment.alt}`);
  return ['imeta', ...parts];
}

/** `p` tags for everyone mentioned inline, so they actually get notified. */
function mentionTags(content: string): string[][] {
  return mentionedPubkeys(content).map((pubkey) => ['p', pubkey]);
}

/** `q` tags for every inline event reference (NIP-18 quote tags). */
function quoteTags(content: string): string[][] {
  return referencedEvents(content).map(({ id, author, relays }) => [
    'q',
    id,
    relays[0] ?? '',
    author ?? '',
  ]);
}

export function buildNoteTags(
  content: string,
  attachments: readonly Attachment[] = [],
): string[][] {
  return [
    ...hashtagTags(content),
    ...mentionTags(content),
    ...quoteTags(content),
    ...attachments.map(imetaTag),
  ];
}

export function publishNote(
  content: string,
  attachments: readonly Attachment[] = [],
): Promise<NostrEvent> {
  return publish({ kind: KIND_TEXT_NOTE, content, tags: buildNoteTags(content, attachments) });
}

/**
 * NIP-10 reply tags, marked form only.
 *
 * Rules that matter for interop:
 *  - A top-level reply carries ONLY a `root` marker. Emitting both root and
 *    reply pointing at the same id makes some clients render it as a reply to
 *    itself.
 *  - A nested reply carries `root` AND `reply`.
 *  - The `p` set is the parent's own `p` tags UNION the parent's author —
 *    this is what puts the reply in everyone's notifications in Amethyst and
 *    Damus. Dropping it is the most common reason a reply "doesn't notify".
 *  - Never emit positional (unmarked) e-tags.
 */
export function buildReplyTags(
  parent: Pick<NostrEvent, 'id' | 'pubkey' | 'tags'>,
  opts: { relayHint?: string } = {},
): string[][] {
  const hint = opts.relayHint ?? '';
  const rootTag = parent.tags.find((tag) => tag[0] === 'e' && tag[3] === 'root');
  const rootId = rootTag?.[1];
  const rootHint = rootTag?.[2] ?? hint;
  const rootAuthor = rootTag?.[4] ?? '';

  const tags: string[][] = [];
  if (rootId && rootId !== parent.id) {
    tags.push(['e', rootId, rootHint, 'root', rootAuthor]);
    tags.push(['e', parent.id, hint, 'reply', parent.pubkey]);
  } else {
    // Replying to a thread root: root marker only.
    tags.push(['e', parent.id, hint, 'root', parent.pubkey]);
  }

  const participants = new Set<string>();
  for (const tag of parent.tags) {
    if (tag[0] === 'p' && tag[1]) participants.add(tag[1]);
  }
  participants.add(parent.pubkey);
  for (const pubkey of participants) tags.push(['p', pubkey]);

  return tags;
}

export function publishReply(
  parent: Pick<NostrEvent, 'id' | 'pubkey' | 'tags'>,
  content: string,
  opts: { relayHint?: string; attachments?: readonly Attachment[] } = {},
): Promise<NostrEvent> {
  const replyTags = buildReplyTags(parent, opts);
  const taggedPubkeys = new Set(
    replyTags.filter((tag) => tag[0] === 'p').map((tag) => tag[1]),
  );
  const extra = buildNoteTags(content, opts.attachments ?? [])
    // Don't duplicate a `p` the reply tags already carry.
    .filter((tag) => !(tag[0] === 'p' && taggedPubkeys.has(tag[1])));
  return publish({ kind: KIND_TEXT_NOTE, content, tags: [...replyTags, ...extra] });
}

/**
 * NIP-18 kind 6 repost. `content` is the stringified JSON of the reposted
 * event: the spec allows empty, but an empty body forces every reader to go
 * fetch the original, and clients that can't render it fall back to a blank
 * card. Embedding the note is what Primal and Damus do.
 */
export function buildRepostTags(
  note: Pick<NostrEvent, 'id' | 'pubkey'>,
  opts: { relayHint?: string } = {},
): string[][] {
  return [
    ['e', note.id, opts.relayHint ?? ''],
    ['p', note.pubkey],
  ];
}

export function publishRepost(
  note: NostrEvent,
  opts: { relayHint?: string } = {},
): Promise<NostrEvent> {
  return publish({
    kind: KIND_REPOST,
    content: JSON.stringify(note),
    tags: buildRepostTags(note, opts),
  });
}

/**
 * Quote post: a kind 1 carrying a `q` tag plus an inline `nostr:nevent…`.
 *
 * Deliberately NOT an `e` tag with a `mention` marker — that form gets pulled
 * into the thread as a reply by several clients, which is exactly what the
 * `q` tag exists to prevent.
 */
export function publishQuote(
  note: Pick<NostrEvent, 'id' | 'pubkey'>,
  comment: string,
  opts: { relayHint?: string; attachments?: readonly Attachment[] } = {},
): Promise<NostrEvent> {
  const relays = opts.relayHint ? [opts.relayHint] : [];
  const ref = encodeEventRef(note.id, { relays, author: note.pubkey });
  const content = comment.trim() ? `${comment.trim()}\n\n${ref}` : ref;
  const tags = buildNoteTags(content, opts.attachments ?? []);
  // `buildNoteTags` already derives the q tag from the inline reference, but
  // add the author p-tag so the quoted user is notified.
  if (!tags.some((tag) => tag[0] === 'p' && tag[1] === note.pubkey)) {
    tags.push(['p', note.pubkey]);
  }
  return publish({ kind: KIND_TEXT_NOTE, content, tags });
}

/**
 * NIP-25 reaction. Default content is `"+"`, which every client reads as a
 * like. `"❤️"` is spec-legal but means "emoji reaction, NOT a like" — the
 * old code sent a heart and it showed up in other clients as an emoji rather
 * than a like, undercounting the note.
 */
export function buildReactionTags(
  note: Pick<NostrEvent, 'id' | 'pubkey' | 'kind'> & { tags?: string[][] },
  opts: { relayHint?: string } = {},
): string[][] {
  const kind = note.kind ?? KIND_TEXT_NOTE;
  const tags: string[][] = [['e', note.id, opts.relayHint ?? '']];
  // Addressable targets (e.g. kind 30023 long-form) need an `a` coordinate
  // IN ADDITION TO the `e` tag, not instead of it. Primal iOS emits `a`
  // alone, and Damus only ever reads `e` — so those reactions are invisible
  // in Damus. Emitting both is what reaches everyone.
  if (kind >= 30000 && kind < 40000) {
    const identifier = note.tags?.find((tag) => tag[0] === 'd')?.[1] ?? '';
    tags.push(['a', `${kind}:${note.pubkey}:${identifier}`, opts.relayHint ?? '']);
  }
  tags.push(['p', note.pubkey]);
  tags.push(['k', String(kind)]);
  return tags;
}

/**
 * The event a reaction points at.
 *
 * Damus copies EVERY `e` and `p` tag off the target into its reaction and
 * appends the real target last, so a naive "first e tag" read picks the wrong
 * event. NIP-25 requires the target to be last, so last-wins is the correct
 * read for every client.
 */
export function reactionTargetId(reaction: Pick<NostrEvent, 'tags'>): string | null {
  let last: string | null = null;
  for (const tag of reaction.tags) {
    if (tag[0] === 'e' && tag[1]) last = tag[1];
  }
  return last;
}

export function publishReaction(
  note: Pick<NostrEvent, 'id' | 'pubkey' | 'kind'> & { tags?: string[][] },
  opts: { content?: string; relayHint?: string; emojiUrl?: string } = {},
): Promise<NostrEvent> {
  const content = opts.content ?? '+';
  const tags = buildReactionTags(note, opts);
  const shortcode = /^:([a-z0-9_+-]+):$/i.exec(content)?.[1];
  if (shortcode && opts.emojiUrl) tags.push(['emoji', shortcode, opts.emojiUrl]);
  return publish({ kind: KIND_REACTION, content, tags });
}

/** NIP-09 delete request for one of the user's own notes. */
export function publishDelete(
  note: Pick<NostrEvent, 'id' | 'kind'>,
  reason = '',
): Promise<NostrEvent> {
  return publish({
    kind: KIND_DELETE,
    content: reason,
    tags: [['e', note.id], ['k', String(note.kind ?? KIND_TEXT_NOTE)]],
  });
}
