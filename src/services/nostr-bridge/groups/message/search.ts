/**
 * NIP-50 message search over the active relay, with the client-side term and
 * `has:` filtering the relay cannot do. Pure move from `client.ts` (round 4
 * plan, step 8); reads no bridge state beyond the context.
 */
import { CodedError } from '@/utils/errors/codes';
import type { Filter } from 'nostr-tools';
import { KIND_GROUP_CHAT_MESSAGE } from '@/constants/nostr/nip-kinds';
import { extractMentionPubkeysFromMessage } from '@/utils/message-text/mentions';
import { customEmojiMapFromTags } from '@/utils/media/tags/custom-emoji-tags';
import { stickerFromTags } from '@/utils/media/tags/sticker-tags';
import { voiceNoteFromTags } from '@/utils/media/tags/voice-note-tags';
import { matchesTerms, relaySearchTerm } from '@/utils/chat/search/search-query';
import { getTag } from '../../common/event-tags';
import type { BridgeContext } from '../../facade/context';
import type { JsSearchOptions, JsSearchResponse } from '../../common/types';

/**
 * Search tunables. The relay can pre-filter on at most one term, so when
 * extra terms or `has:` filters will be applied client-side we pull a wider
 * window and trim after, otherwise `has:image` fetches 30 recent messages,
 * throws away 29 of them, and reads as "no results".
 */
const SEARCH_OVERFETCH_FACTOR = 8;
const SEARCH_MAX_FETCH = 500;
const SEARCH_TIMEOUT_MS = 8000;

export type SearchContext = Pick<BridgeContext, 'relays' | 'queryRelaysWithConfidence'>;

export async function searchMessages(ctx: SearchContext, opts: JsSearchOptions): Promise<JsSearchResponse> {
  const limit = opts.limit ?? 50;
  const terms = opts.terms ?? [];
  const has = new Set(opts.has ?? []);
  const relaySupportsSearch = opts.relaySupportsSearch !== false;

  // The relay can only pre-filter on one term; anything beyond that (extra
  // terms, `has:`) is our job, so widen the window when we'll be discarding.
  const relayTerm = relaySupportsSearch ? relaySearchTerm(terms) : undefined;
  const localOnly = (relayTerm === undefined ? terms.length : terms.length - 1) + has.size;
  const fetchLimit = localOnly > 0
    ? Math.min(limit * SEARCH_OVERFETCH_FACTOR, SEARCH_MAX_FETCH)
    : limit;

  const filter: Filter & { search?: string } = {
    kinds: [KIND_GROUP_CHAT_MESSAGE],
    limit: fetchLimit,
  };
  if (relayTerm) filter.search = relayTerm;
  if (opts.authors && opts.authors.length > 0) filter.authors = [...opts.authors];
  if (opts.mentions && opts.mentions.length > 0) (filter as Record<string, unknown>)['#p'] = [...opts.mentions];
  if (opts.groupIds && opts.groupIds.length > 0) {
    (filter as Record<string, unknown>)['#h'] = Array.from(new Set(opts.groupIds));
  }
  if (opts.since) filter.since = opts.since;
  if (opts.until) filter.until = opts.until;

  const { events, complete } = await ctx.queryRelaysWithConfidence(ctx.relays(), filter, SEARCH_TIMEOUT_MS);
  if (events.length === 0 && !complete) throw new CodedError('search-timeout', 'Search timed out. Try again.');

  const URL_RE = /https?:\/\/\S+/i;
  const IMG_RE = /https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif|svg)(?:\?\S*)?/i;
  const FILE_RE = /https?:\/\/\S+\.(?:pdf|zip|tar|gz|mp3|mp4|mov|webm|wav|csv|json|txt|md)(?:\?\S*)?/i;
  const hasMatches = (content: string) => {
    if (has.size === 0) return true;
    if (has.has('image') && !IMG_RE.test(content)) return false;
    if (has.has('file') && !FILE_RE.test(content)) return false;
    if (has.has('link') && !URL_RE.test(content)) return false;
    return true;
  };

  const all = events
    .filter((e) => hasMatches(e.content) && matchesTerms(e.content, terms))
    .map((e) => {
      const eventGroupId = getTag(e, 'h');
      return {
        id: e.id,
        pubkey: e.pubkey,
        content: e.content,
        createdAt: e.created_at,
        kind: e.kind,
        replyToId: getTag(e, 'e') ?? null,
        mentions: extractMentionPubkeysFromMessage(e.content, e.tags),
        customEmojis: customEmojiMapFromTags(e.tags),
        sticker: stickerFromTags(e.content, e.tags) ?? undefined,
        voiceNote: voiceNoteFromTags(e.content, e.tags) ?? undefined,
        groupId: eventGroupId ?? null,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  return {
    hits: all.slice(0, limit),
    // More matches than we can show, or the relay never finished: either
    // way the list on screen is not the whole answer.
    partial: !complete || all.length > limit || events.length >= fetchLimit,
    relayFiltered: relayTerm !== undefined,
  };
}
