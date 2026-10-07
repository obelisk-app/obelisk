/**
 * Kind 9 into a channel's store (round 4 plan, step 14): dedupe, the
 * optimistic placeholder replaced in place, the debounced cache flush, the
 * mention/reply ping, deletions removed, and paging older history. Pure
 * move from `client.ts`.
 */
import type { MessagesContext, MessagesDeps, MessagesParts } from './module';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { KIND_GROUP_CHAT_MESSAGE } from '@/constants/nostr/nip-kinds';
import { customEmojiMapFromTags } from '@/utils/media/tags/custom-emoji-tags';
import { stickerFromTags } from '@/utils/media/tags/sticker-tags';
import { voiceNoteFromTags } from '@/utils/media/tags/voice-note-tags';
import { extractMentionPubkeysFromMessage } from '@/utils/message-text/mentions';
import { classifyGroupPing } from '@/services/notifications/classify';
import { isUserWatchingChannel } from '@/services/read-state/read-gates';
import { cacheDelete, cacheSet } from '../../cache/cache';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import type { JsMessage, LoadMoreMessagesResult } from '../../common/types';
import type { MessagesState } from './state';
import { CACHE_FLUSH_DELAY_MS, LOAD_MORE_PAGE_SIZE, MESSAGE_CACHE_LIMIT } from '@/constants/nostr-bridge/groups';

export class MessageIngest {
  constructor(
    private readonly s: MessagesState,
    private readonly ctx: MessagesContext,
    private readonly deps: MessagesDeps,
    private readonly m: MessagesParts,
  ) {}

  ingest(groupId: string, ev: NostrEvent): void {
    if (this.deps.moderation.isModerated(groupId, ev.id)) return;
    if (this.deps.moderation.isDeletedByAuthor(groupId, ev.id, ev.pubkey)) return;
    const replyTo = ev.tags.find((t) => t[0] === 'e' && t[3] === 'reply')?.[1] ?? null;
    const mentions = extractMentionPubkeysFromMessage(ev.content, ev.tags);
    const msg: JsMessage = {
      id: ev.id,
      pubkey: ev.pubkey,
      content: ev.content,
      createdAt: ev.created_at,
      kind: ev.kind,
      replyToId: replyTo,
      mentions,
      customEmojis: customEmojiMapFromTags(ev.tags),
      sticker: stickerFromTags(ev.content, ev.tags) ?? undefined,
      voiceNote: voiceNoteFromTags(ev.content, ev.tags) ?? undefined,
    };
    let isNew = false;
    let replacedClientTag: string | null = null;
    this.s.messagesByGroup.update((prev) => {
      const existing = prev[groupId] ?? [];
      if (existing.some((m) => m.id === msg.id)) return prev;
      // Relay echo of an optimistic placeholder we sent, replace in place
      // so the bubble's React key (msg.id) only changes once. Match on the
      // tuple we control end-to-end (pubkey, content, created_at) since the
      // pre-sign placeholder doesn't have an id yet.
      const pendingIdx = existing.findIndex(
        (m) =>
          m.pending === true
          && m.pubkey === msg.pubkey
          && m.content === msg.content
          && m.createdAt === msg.createdAt,
      );
      if (pendingIdx >= 0) {
        replacedClientTag = existing[pendingIdx].clientTag ?? null;
        const next = [...existing];
        next[pendingIdx] = msg;
        next.sort((a, b) => a.createdAt - b.createdAt);
        isNew = true;
        return { ...prev, [groupId]: next };
      }
      isNew = true;
      const next = [...existing, msg].sort((a, b) => a.createdAt - b.createdAt);
      return { ...prev, [groupId]: next };
    });
    if (replacedClientTag) this.s.pendingSends.delete(replacedClientTag);
    // Lazy metadata fetch for any author we haven't seen yet.
    this.deps.ensureUserMetadata(ev.pubkey);
    // A real event arrived: the channel is definitively non-empty. Cancel
    // any pending empty-EOSE retry and flip status. Doing this here
    // (rather than only in the EOSE callback) covers the case where
    // events arrive AFTER an empty EOSE but BEFORE the retry timer fires
    //, without it the bridge would still schedule a needless restart.
    if (isNew) {
      this.s.setStatus(groupId, 'has-messages');
      this.m.retry.clear(groupId);
      if (groupId === this.s.activeGroupId) this.m.queue.maybeResume();
      // Persist for next reload, stale-while-revalidate paint of the last
      // window of messages so the chat pane has something to show before
      // the live REQ round-trips. See {@link MESSAGE_CACHE_LIMIT} and
      // `flushCache` for the cap + sanitization.
      this.scheduleCacheFlush(groupId);
    }
    // Mention/reply notification. An explicit `@you` or a reply to one of
    // our own messages pings; ordinary channel traffic does not. Per-channel
    // unread dots are a separate concern, derived in the UI from
    // `useReadStateStore.groupCursors[groupId]` vs `messages[].createdAt`.
    //
    // This path covers the active relay. Relays the user used recently but
    // isn't browsing are covered by the background watcher
    // (`background-watch.ts`), which stamps cards with its own relay. The
    // card is stamped with the relay so it never surfaces while browsing a
    // different one.
    //
    // Backfill is filtered by the relay's mention cursor inside
    // `pushMention`, `registerRelay` stamps a floor on first connect so
    // the history of a relay the user just joined doesn't flood the bell.
    if (!isNew) return;
    const me = this.ctx.session()?.pubKeyHex ?? null;
    const parentAuthor = replyTo
      ? (this.s.messagesByGroup.get()[groupId]?.find((m) => m.id === replyTo)?.pubkey ?? null)
      : null;
    const reason = classifyGroupPing({ pubkey: ev.pubkey, tags: ev.tags, mentions, parentAuthor }, me);
    const relay = this.ctx.currentRelayUrl.get();
    if (!relay) return;
    const channelName = this.ctx.groups.get().find((g) => g.id === groupId)?.name ?? null;
    // Watching the channel is NOT the same as having seen the mention (it
    // may be off-screen, or the channel just opened). The card is always
    // made; `useMentionSeen` clears it once the message is actually on
    // screen. Only the chime is skipped, it would fire in your face.
    this.deps.pings.deliverGroupPing({
      relay,
      channelId: groupId,
      ev,
      reason,
      watching: isUserWatchingChannel(groupId),
      where: channelName ? `#${channelName}` : null,
    });
  }

  /**
   * A deletion landed (moderation's call): drop the named messages from the
   * channel's store, only the author's when `author` is set (NIP-09; group
   * moderation, kind 9005, removes any), and return the ids actually gone
   * so the reactions on them can follow.
   */
  removeDeleted(groupId: string, ids: ReadonlySet<string>, author: string | null): Set<string> {
    const removed = new Set<string>();
    this.s.messagesByGroup.update((all) => {
      const existing = all[groupId];
      if (!existing) return all;
      const next = existing.filter((msg) => {
        if (!ids.has(msg.id) || (author !== null && msg.pubkey !== author)) return true;
        removed.add(msg.id);
        return false;
      });
      if (next.length === existing.length) return all;
      return { ...all, [groupId]: next };
    });
    if (removed.size > 0) this.scheduleCacheFlush(groupId);
    return removed;
  }

  /**
   * Schedule a debounced write of `messagesByGroup[groupId]` to the
   * stale-while-revalidate cache. A burst of ingest calls (e.g. the
   * initial kind 9 limit:50 backfill) collapses into a single
   * localStorage.setItem at the end of the burst, cheap, and the
   * worst-case data loss on tab close is whatever arrived in the last
   * 200ms which the relay will re-deliver next session anyway.
   *
   * No-ops while logged out so a late ingest (e.g. an in-flight event on
   * a released sub from the previous session) can't write under the
   * old account's relay key. See `cacheClearAll` on logout.
   */
  scheduleCacheFlush(groupId: string): void {
    if (!this.ctx.session()) return;
    const existing = this.s.cacheFlushTimers.get(groupId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.s.cacheFlushTimers.delete(groupId);
      this.flushCache(groupId);
    }, CACHE_FLUSH_DELAY_MS);
    this.s.cacheFlushTimers.set(groupId, timer);
  }

  /**
   * Synchronous write of the last {@link MESSAGE_CACHE_LIMIT} confirmed
   * messages for `groupId` to localStorage. Filters out optimistic
   * placeholders, a cached pending bubble would resurrect on cold load
   * even though the publish actually finished hours ago.
   */
  flushCache(groupId: string): void {
    if (!this.ctx.session()) return;
    const all = this.s.messagesByGroup.get()[groupId] ?? [];
    const confirmed = all.filter((m) => !m.pending && !m.failed);
    if (confirmed.length === 0) {
      // Nothing worth caching (only optimistic placeholders, or store
      // emptied between schedule and flush). Drop any stale on-disk entry
      // so a previous larger snapshot doesn't ghost-paint after the user
      // saw the channel empty.
      cacheDelete(this.ctx.currentRelayUrl.get(), KIND_GROUP_CHAT_MESSAGE, groupId);
      return;
    }
    const trimmed = confirmed.length > MESSAGE_CACHE_LIMIT
      ? confirmed.slice(confirmed.length - MESSAGE_CACHE_LIMIT)
      : confirmed;
    cacheSet(this.ctx.currentRelayUrl.get(), KIND_GROUP_CHAT_MESSAGE, groupId, trimmed);
  }

  async loadMore(groupId: string): Promise<LoadMoreMessagesResult> {
    // Page older messages on demand. Live REQ stays capped at
    // BACKGROUND_MESSAGE_LIMIT; "Load earlier" calls this with the oldest
    // currently-rendered message as the upper bound.
    //
    // Result contract:
    // - 'added'      , at least one previously-unseen event was ingested.
    // - 'end'        , the active relay/index returned an authoritative
    //                   empty older page while relay access was confirmed.
    // - 'unavailable', no safe conclusion (missing anchor, auth still
    //                   settling, transport error, duplicate-only page).
    //
    // The UI must only show "no earlier messages" for 'end'. Everything
    // else remains retryable so AUTH races and normal relay hiccups do not
    // become false history-end signals.
    const existing = this.s.messagesByGroup.get()[groupId] ?? [];
    if (existing.length === 0) return 'unavailable';
    const oldest = existing.reduce((a, m) => (m.createdAt < a ? m.createdAt : a), existing[0].createdAt);
    const relayKey = normalizeRelayUrl(this.ctx.currentRelayUrl.get());
    const accessBefore = this.ctx.relayAccess.get()[relayKey] ?? 'unknown';
    if (accessBefore === 'authenticating') {
      const settled = await this.deps.waitForRelayAuth(3500);
      if (settled !== 'ok') return 'unavailable';
    }
    const filter: Filter = {
      kinds: [KIND_GROUP_CHAT_MESSAGE],
      '#h': [groupId],
      until: oldest - 1,
      limit: LOAD_MORE_PAGE_SIZE,
    };
    const relayBefore = this.ctx.currentRelayUrl.get();
    // Fresh: a page that came back 'unavailable' is retried by the user, and
    // the cache keeps an uncertain answer for 10 s, which would hand the
    // retry the same failure. The fresh answer still refreshes the cache.
    const { events, complete } = await this.ctx.queryRelaysWithConfidence(this.ctx.relays(), filter, 5000, { cache: 'fresh' });
    if (this.ctx.currentRelayUrl.get() !== relayBefore) return 'unavailable';
    const accessAfter = this.ctx.relayAccess.get()[relayKey] ?? 'unknown';
    if (events.length === 0) return complete && accessAfter === 'ok' ? 'end' : 'unavailable';
    let added = 0;
    for (const ev of events) {
      const before = this.s.messagesByGroup.get()[groupId]?.length ?? 0;
      this.ingest(groupId, ev);
      const after = this.s.messagesByGroup.get()[groupId]?.length ?? 0;
      if (after > before) added++;
    }
    return added > 0 ? 'added' : 'unavailable';
  }
}
