/**
 * Does this NIP-29 kind 9 ping `me`, and why?
 *
 * Shared by the active-relay ingest (`client.ts:ingestMessage`) and the
 * background relay watcher so both paths agree on what a notification is.
 *
 *   • `reply`   — a NIP-10 `["e", id, _, "reply"]` whose parent is ours.
 *     The parent's author is known either from the local message list
 *     (`parentAuthor`) or, when the parent isn't loaded, from the `p` tag
 *     every reply carries for the parent's author (Obelisk and most NIP-29
 *     clients add one).
 *   • `mention` — `me` appears as a `nostr:npub` in the content or a `p` tag.
 *
 * Reply wins when both hold: "X replied to you" is the more specific story.
 * Our own events never ping.
 */
import type { MentionReason } from '@/store/notifications';

export interface ClassifyInput {
  readonly pubkey: string;
  readonly tags: ReadonlyArray<ReadonlyArray<string>>;
  /** Pubkeys mentioned (content + `p` tags) — `extractMentionPubkeysFromMessage`. */
  readonly mentions: ReadonlyArray<string>;
  /** Author of the replied-to event, when it is loaded locally. */
  readonly parentAuthor?: string | null;
}

export function replyTargetId(tags: ReadonlyArray<ReadonlyArray<string>>): string | null {
  return tags.find((t) => t[0] === 'e' && t[3] === 'reply')?.[1] ?? null;
}

export function classifyGroupPing(ev: ClassifyInput, me: string | null): MentionReason | null {
  if (!me || ev.pubkey === me) return null;
  const replyTo = replyTargetId(ev.tags);
  if (replyTo) {
    if (ev.parentAuthor === me) return 'reply';
    if (ev.parentAuthor == null && ev.tags.some((t) => t[0] === 'p' && t[1] === me)) return 'reply';
  }
  if (ev.mentions.includes(me)) return 'mention';
  return null;
}

/** Human title for an OS popup about a group ping. */
export function groupPingTitle(
  reason: MentionReason,
  sender: string,
  where: string | null,
): string {
  const verb = reason === 'reply' ? 'replied to you' : 'mentioned you';
  return where ? `${sender} ${verb} in ${where}` : `${sender} ${verb}`;
}

/** Strip `nostr:` URIs down to something readable for a popup body. */
export function previewText(content: string, max = 140): string {
  const flat = content
    .replace(/nostr:(npub|nprofile|note|nevent|naddr)1[02-9ac-hj-np-z]+/gi, '@…')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
