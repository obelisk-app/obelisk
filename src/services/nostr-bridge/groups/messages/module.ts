/**
 * Group messages (kind 9), the largest module of the round 4 plan (step 14):
 * one shared state (`./state.ts`) and the five parts that work on it, the
 * queue, the per-channel stream, the empty-EOSE retry ladder, the send path
 * and the ingest. A pure move of the facade's messages half: every method
 * body is the one `client.ts` ran, with `this.x` for the facade's other
 * parts now `this.m.part.x`, so the order of every store write, every
 * `setTimeout` and every REQ is unchanged (the fake-timer cases in
 * `bridge.test.ts` pin that). This module only builds the parts and exposes
 * what the facade and the lifecycle call.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import type { BridgeContext } from '../../context';
import type { ModerationModule } from '../moderation';
import type { PingsModule } from '../../pings';
import type { MessagesLifecycle } from '../../session/lifecycle';
import type { LoadMoreMessagesResult, RelayAccessState } from '../../types';
import { MessageIngest } from './ingest';
import { MessageQueue } from './queue';
import { MessageRetry } from './retry';
import { seedCachedMessagesForGroup, seedMessagesFromCache, type MessageSeedStores } from './seed';
import { MessageSend } from './send';
import { MessagesState } from './state';
import { MessageStream } from './stream';

export type MessagesContext = Pick<
  BridgeContext,
  | 'session'
  | 'relays'
  | 'currentRelayUrl'
  | 'relayAccess'
  | 'groups'
  | 'subscribeWatched'
  | 'track'
  | 'untrack'
  | 'queryRelaysWithConfidence'
  | 'signAndPublish'
>;

export interface MessagesDeps {
  /** `loadMoreMessages` waits out an AUTH in flight before it trusts an empty page (`relay-access.ts`). */
  waitForRelayAuth(timeoutMs: number): Promise<'ok' | 'timeout' | RelayAccessState>;
  readonly moderation: Pick<ModerationModule, 'isModerated' | 'isDeletedByAuthor' | 'ingestEventDeletion' | 'ingestGroupEventDeletion'>;
  readonly pings: Pick<PingsModule, 'recordRelayUse' | 'deliverGroupPing'>;
  ensureUserMetadata(pubkey: string): void;
}

/** How the parts reach each other (always through the module, at call time). */
export interface MessagesParts {
  readonly queue: MessageQueue;
  readonly stream: MessageStream;
  readonly retry: MessageRetry;
  readonly send: MessageSend;
  readonly ingestor: MessageIngest;
  readonly seedStores: MessageSeedStores;
  /** A quota CLOSED took the channel's REQ away: forget it so a later open re-subscribes. */
  forgetSub(groupId: string): void;
}

export class MessagesModule implements MessagesParts {
  readonly queue: MessageQueue;
  readonly stream: MessageStream;
  readonly retry: MessageRetry;
  readonly send: MessageSend;
  readonly ingestor: MessageIngest;
  readonly seedStores: MessageSeedStores;

  constructor(
    readonly state: MessagesState,
    private readonly ctx: MessagesContext,
    deps: MessagesDeps,
  ) {
    this.queue = new MessageQueue(state, ctx, this);
    this.stream = new MessageStream(state, ctx, deps, this);
    this.retry = new MessageRetry(state, ctx, this);
    this.send = new MessageSend(state, ctx, deps);
    this.ingestor = new MessageIngest(state, ctx, deps, this);
    this.seedStores = {
      groups: ctx.groups,
      messagesByGroup: state.messagesByGroup,
      messagesStatusByGroup: state.messagesStatusByGroup,
      setStatus: (groupId, status) => state.setStatus(groupId, status),
    };
  }

  forgetSub(groupId: string): void {
    const sub = this.state.subByGroup.get(groupId);
    if (sub) this.ctx.untrack(sub);
    this.state.subByGroup.delete(groupId);
    this.state.subscribedGroups.delete(groupId);
  }

  // ---- what the facade calls -----------------------------------------------

  sendMessage(
    groupId: string,
    content: string,
    replyTo?: { id: string; pubkey: string } | null,
    emojiTags: ReadonlyArray<ReadonlyArray<string>> = [],
  ): Promise<void> {
    return this.send.sendMessage(groupId, content, replyTo, emojiTags);
  }

  loadMore(groupId: string): Promise<LoadMoreMessagesResult> {
    return this.ingestor.loadMore(groupId);
  }

  /** The cold paint's message share (`../../seed.ts`). */
  seedFromCache(relay: string, hiddenGroupIds: ReadonlySet<string>, idsFor: (kind: number) => string[]): boolean {
    return seedMessagesFromCache(this.seedStores, relay, hiddenGroupIds, idsFor);
  }

  seedGroup(relay: string, groupId: string): boolean {
    return seedCachedMessagesForGroup(this.seedStores, relay, groupId);
  }

  removeDeleted(groupId: string, ids: ReadonlySet<string>, author: string | null): Set<string> {
    return this.ingestor.removeDeleted(groupId, ids, author);
  }

  ingest(groupId: string, ev: NostrEvent): void {
    this.ingestor.ingest(groupId, ev);
  }

  /** The group-message state's share of the lifecycle resets (`../../session/lifecycle.ts`). */
  lifecycle(): MessagesLifecycle {
    const s = this.state;
    return {
      subscribedGroups: () => Array.from(s.subscribedGroups),
      activeGroupId: () => s.activeGroupId,
      forgetSubscriptions: () => {
        s.subscribedGroups.clear();
        s.subByGroup.clear();
      },
      clearStore: () => s.messagesByGroup.set({}),
      clearPendingSends: () => s.pendingSends.clear(),
      resetStatus: () => s.messagesStatusByGroup.set({}),
      clearAllRetry: () => this.retry.clearAll(),
      clearQueue: () => {
        s.pendingQueue = [];
        s.pendingSet.clear();
      },
      clearTimers: () => {
        if (s.pendingTimer) {
          clearTimeout(s.pendingTimer);
          s.pendingTimer = null;
        }
        if (s.priorityTimer) {
          clearTimeout(s.priorityTimer);
          s.priorityTimer = null;
        }
        s.priorityDeadline = 0;
      },
      clearFlushers: () => {
        for (const t of s.cacheFlushTimers.values()) clearTimeout(t);
        s.cacheFlushTimers.clear();
      },
      clearQuerySyncFallback: () => s.querySyncFallbackFired.clear(),
      clearActiveGroup: () => { s.activeGroupId = null; },
    };
  }
}
