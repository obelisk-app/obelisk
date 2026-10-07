/**
 * Reactions (kind 7): the per-channel store, the per-group REQ, the send and
 * remove commands and the debounced cache flush. Pure move from `client.ts`
 * (round 4 plan, step 13). Moderation owns the tombstones; this module asks
 * it before ingesting and removes what it says is gone (`removeDeleted`).
 */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { KIND_EVENT_DELETION, KIND_REACTION } from '@/utils/nostr/nip-kinds';
import { customEmojiMapFromTags } from '@/utils/media/tags/custom-emoji-tags';
import { cacheDelete, cacheGet, cacheSet } from '../../cache/cache';
import { getTag } from '../../common/event-tags';
import { StateStore } from '../../common/state-store';
import type { BridgeContext, TrackedSub } from '../../facade/context';
import type { JsReaction } from '../../common/types';

/** Reactions kept on disk per channel, oldest dropped first. */
export const REACTION_CACHE_LIMIT = 500;
/** How long a burst of ingests waits before one localStorage write; see the messages flush. */
const CACHE_FLUSH_DELAY_MS = 200;

export type ReactionsContext = Pick<
  BridgeContext,
  'session' | 'relays' | 'currentRelayUrl' | 'subscribeWatched' | 'track' | 'untrack' | 'closeTracked' | 'signAndPublish'
>;

export interface ReactionsDeps {
  isModerated(groupId: string, eventId: string): boolean;
  isDeletedByAuthor(groupId: string, eventId: string, pubkey: string): boolean;
  /** `removeReaction` publishes a NIP-09 deletion; moderation applies it. */
  ingestEventDeletion(groupId: string, ev: NostrEvent): void;
  /** A channel's reactions stream opens its NIP-09 deletion stream alongside. */
  ensureEventDeletions(groupId: string): void;
}

export class ReactionsModule {
  readonly reactionsByGroup = new StateStore<Record<string, Record<string, JsReaction[]>>>({});
  private readonly subscribedGroups = new Set<string>();
  private readonly subByGroup = new Map<string, TrackedSub>();
  private readonly cacheFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly ctx: ReactionsContext,
    private readonly deps: ReactionsDeps,
  ) {}

  // ---- actions ------------------------------------------------------------

  async sendReaction(
    targetEventId: string,
    targetPubkey: string,
    emoji: string,
    groupId: string,
    emojiTags: ReadonlyArray<ReadonlyArray<string>> = [],
  ): Promise<void> {
    const emojiTagsCopy = emojiTags.map((tag) => [...tag]);
    const event = await this.ctx.signAndPublish({
      kind: KIND_REACTION,
      content: emoji,
      tags: [
        ...emojiTagsCopy,
        ['e', targetEventId],
        ['p', targetPubkey],
        ['h', groupId],
      ],
      created_at: Math.floor(Date.now() / 1000),
    });
    this.ingest(groupId, event);
  }

  async removeReaction(groupId: string, reactionEventId: string): Promise<void> {
    const event = await this.ctx.signAndPublish({
      kind: KIND_EVENT_DELETION,
      content: 'remove reaction',
      tags: [
        ['e', reactionEventId],
        ['k', String(KIND_REACTION)],
        ['h', groupId],
      ],
      created_at: Math.floor(Date.now() / 1000),
    });
    this.deps.ingestEventDeletion(groupId, event);
  }

  // ---- the per-group REQ --------------------------------------------------

  ensurePerGroup(groupId: string): void {
    if (this.subscribedGroups.has(groupId)) return;
    this.subscribedGroups.add(groupId);
    const reactionFilter: Filter = { kinds: [KIND_REACTION], '#h': [groupId], limit: 500 };
    const reactionSub = this.ctx.subscribeWatched(
      this.ctx.relays(),
      reactionFilter,
      (ev) => this.ingest(groupId, ev),
      undefined,
      {
        watchdogMs: 3000,
        affectsRelayAccess: false,
        onQuotaOrRateLimitClose: () => this.forgetPerGroup(groupId),
      },
    );
    this.ctx.track(reactionSub);
    this.subByGroup.set(groupId, reactionSub);
    this.deps.ensureEventDeletions(groupId);
  }

  hasPerGroup(groupId: string): boolean {
    return this.subscribedGroups.has(groupId);
  }

  /** The channels with a live reactions REQ, for a reset's re-issue list. */
  subscribed(): string[] {
    return Array.from(this.subscribedGroups);
  }

  /** Forget without a CLOSE: the relay already closed it. */
  private forgetPerGroup(groupId: string): void {
    const sub = this.subByGroup.get(groupId);
    if (sub) this.ctx.untrack(sub);
    this.subByGroup.delete(groupId);
    this.subscribedGroups.delete(groupId);
  }

  // ---- ingest -------------------------------------------------------------

  ingest(groupId: string, ev: NostrEvent): void {
    const targetEventId = getTag(ev, 'e');
    if (!targetEventId) return;
    if (this.deps.isModerated(groupId, ev.id)) return;
    if (this.deps.isDeletedByAuthor(groupId, ev.id, ev.pubkey)) return;
    if (this.deps.isModerated(groupId, targetEventId)) return;
    const reaction: JsReaction = {
      id: ev.id,
      pubkey: ev.pubkey,
      emoji: ev.content || '+',
      customEmojis: customEmojiMapFromTags(ev.tags),
      targetEventId,
      createdAt: ev.created_at,
    };
    let changed = false;
    this.reactionsByGroup.update((all) => {
      const forGroup = { ...(all[groupId] ?? {}) };
      const existing = forGroup[targetEventId] ?? [];
      if (existing.some((r) => r.id === reaction.id)) return all;
      changed = true;
      forGroup[targetEventId] = [...existing, reaction];
      return { ...all, [groupId]: forGroup };
    });
    // Persist reactions so emoji badges paint instantly on cold load, same
    // motivation as message caching. Skipping when nothing changed avoids a
    // write storm on re-ingest of already-known reactions (typical after a
    // relay reconnect).
    if (changed) this.scheduleCacheFlush(groupId);
  }

  /**
   * A deletion landed (moderation's call): drop the named reactions, only
   * the author's when `author` is set (NIP-09 deletes are accepted from the
   * reaction author only; group moderation, kind 9005, removes any), and
   * every reaction on a target in `deletedTargets`. `messagesChanged` is
   * the NIP-09 path's extra flush condition: a deleted message took its
   * reactions' cache entry with it even when no reaction row changed.
   */
  removeDeleted(
    groupId: string,
    ids: ReadonlySet<string>,
    author: string | null,
    deletedTargets: ReadonlySet<string>,
    messagesChanged: boolean,
  ): void {
    let reactionsChanged = false;
    this.reactionsByGroup.update((all) => {
      const forGroup = all[groupId];
      if (!forGroup) return all;
      const nextGroup: Record<string, JsReaction[]> = {};
      for (const [targetEventId, reactions] of Object.entries(forGroup)) {
        if (deletedTargets.has(targetEventId)) {
          reactionsChanged = true;
          continue;
        }
        const nextReactions = reactions.filter((reaction) => {
          if (!ids.has(reaction.id)) return true;
          return author !== null && reaction.pubkey !== author;
        });
        if (nextReactions.length !== reactions.length) reactionsChanged = true;
        if (nextReactions.length > 0) nextGroup[targetEventId] = nextReactions;
      }
      if (!reactionsChanged) return all;
      return { ...all, [groupId]: nextGroup };
    });
    if (reactionsChanged || messagesChanged) this.scheduleCacheFlush(groupId);
  }

  // ---- cache --------------------------------------------------------------

  /** Mirror of the messages module's debounced flush for kind 7. */
  private scheduleCacheFlush(groupId: string): void {
    if (!this.ctx.session()) return;
    const existing = this.cacheFlushTimers.get(groupId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.cacheFlushTimers.delete(groupId);
      this.flushCache(groupId);
    }, CACHE_FLUSH_DELAY_MS);
    this.cacheFlushTimers.set(groupId, timer);
  }

  /**
   * Synchronous write of the reaction map for `groupId`. Caps total
   * reactions at {@link REACTION_CACHE_LIMIT} by dropping the oldest by
   * `createdAt`. Cheaper than per-target caps and avoids favouring a
   * single high-reaction message.
   */
  private flushCache(groupId: string): void {
    if (!this.ctx.session()) return;
    const byTarget = this.reactionsByGroup.get()[groupId];
    if (!byTarget) {
      cacheDelete(this.ctx.currentRelayUrl.get(), KIND_REACTION, groupId);
      return;
    }
    let total = 0;
    for (const arr of Object.values(byTarget)) total += arr.length;
    if (total === 0) {
      cacheDelete(this.ctx.currentRelayUrl.get(), KIND_REACTION, groupId);
      return;
    }
    let toCache: Record<string, JsReaction[]> = byTarget;
    if (total > REACTION_CACHE_LIMIT) {
      const flat: JsReaction[] = [];
      for (const arr of Object.values(byTarget)) flat.push(...arr);
      flat.sort((a, b) => a.createdAt - b.createdAt);
      const kept = flat.slice(flat.length - REACTION_CACHE_LIMIT);
      const regrouped: Record<string, JsReaction[]> = {};
      for (const r of kept) {
        const cur = regrouped[r.targetEventId] ?? [];
        regrouped[r.targetEventId] = [...cur, r];
      }
      toCache = regrouped;
    }
    cacheSet(this.ctx.currentRelayUrl.get(), KIND_REACTION, groupId, toCache);
  }

  /** Drop every pending flush: a debounce armed under the previous relay must not write under the new key. */
  clearFlushers(): void {
    for (const t of this.cacheFlushTimers.values()) clearTimeout(t);
    this.cacheFlushTimers.clear();
  }

  /** Paint cached reactions for the channels that have none in memory yet; hidden channels are skipped. */
  seedFromCache(relay: string, hiddenGroupIds: ReadonlySet<string>, idsFor: (kind: number) => string[]): void {
    const cachedReactions: Record<string, Record<string, JsReaction[]>> = {};
    const currentReactions = this.reactionsByGroup.get();
    for (const groupId of idsFor(KIND_REACTION)) {
      if (hiddenGroupIds.has(groupId)) continue;
      if (currentReactions[groupId]) continue;
      const entry = cacheGet<Record<string, JsReaction[]>>(relay, KIND_REACTION, groupId);
      if (entry) cachedReactions[groupId] = entry.value;
    }
    if (Object.keys(cachedReactions).length > 0) {
      this.reactionsByGroup.update((prev) => ({ ...cachedReactions, ...prev }));
    }
  }

  // ---- lifecycle ----------------------------------------------------------

  /** Session reset and relay switch: the REQs were released by the caller; forget the bookkeeping. */
  forgetSubscriptions(): void {
    this.subscribedGroups.clear();
    this.subByGroup.clear();
  }

  /** Relay switch: reactions are scoped to one relay. */
  clear(): void {
    this.reactionsByGroup.set({});
  }
}
