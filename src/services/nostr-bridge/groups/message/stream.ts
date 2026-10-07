/**
 * One channel's kind 9 REQ (round 4 plan, step 14): opening it, deciding
 * what an EOSE means, restarting it (the retry ladder, a "Reload", an
 * empty-confirmed channel re-entered) and the after-AUTH sweep of channels
 * stuck loading. Pure move from `client.ts`.
 */
import type { MessagesContext, MessagesDeps, MessagesParts } from './module';
import type { Filter } from 'nostr-tools';
import { KIND_EVENT_DELETION, KIND_GROUP_CHAT_MESSAGE, KIND_GROUP_DELETE_EVENT } from '@/utils/nostr/nip-kinds';
import type { MessagesStatus } from '../../common/types';
import { seedCachedMessagesForGroup } from './seed';
import { BACKGROUND_MESSAGE_LIMIT, type MessagesState } from './state';

export class MessageStream {
  constructor(
    private readonly s: MessagesState,
    private readonly ctx: MessagesContext,
    private readonly deps: MessagesDeps,
    private readonly m: MessagesParts,
  ) {}

  subscribe(groupId: string): void {
    if (this.s.subscribedGroups.has(groupId)) return;
    this.s.subscribedGroups.add(groupId);
    // Initial status: if the bridge already has cached messages for this
    // group (e.g. a returning subscriber after a relay switch), keep
    // 'has-messages'; otherwise enter 'loading' so the UI shows a spinner
    // until the bridge confirms emptiness or events arrive.
    const seedMsgs = this.s.messagesByGroup.get()[groupId] ?? [];
    this.s.setStatus(groupId, seedMsgs.length > 0 ? 'has-messages' : 'loading');
    const filter: Filter = {
      kinds: [KIND_GROUP_CHAT_MESSAGE, KIND_EVENT_DELETION, KIND_GROUP_DELETE_EVENT],
      '#h': [groupId],
      limit: BACKGROUND_MESSAGE_LIMIT,
    };
    const sub = this.ctx.subscribeWatched(
      this.ctx.relays(),
      filter,
      (ev) => {
        if (ev.kind === KIND_GROUP_CHAT_MESSAGE) this.m.ingestor.ingest(groupId, ev);
        else if (ev.kind === KIND_EVENT_DELETION) this.deps.moderation.ingestEventDeletion(groupId, ev);
        else if (ev.kind === KIND_GROUP_DELETE_EVENT) this.deps.moderation.ingestGroupEventDeletion(groupId, ev);
      },
      () => {
        // Decide confidence: events already ingested? Trust the relay
        // and stop retrying. Empty? Drop to 'empty-unconfirmed' and let
        // the retry ladder run before the UI ever sees "No messages".
        const msgs = this.s.messagesByGroup.get()[groupId] ?? [];
        if (msgs.length > 0) {
          this.s.setStatus(groupId, 'has-messages');
          this.m.retry.clear(groupId);
        } else if (this.s.messagesStatusByGroup.get()[groupId] !== 'empty-confirmed') {
          // Once the ladder has promoted status to `empty-confirmed`, additional
          // empty EOSEs (typically caused by the hub re-issuing the REQ
          // after an `auth-required` CLOSED race) MUST NOT bounce status
          // back to `empty-unconfirmed`, that would restart the ladder and the
          // UI would oscillate "No messages yet" ↔ "Loading messages…" forever.
          // A late real message still promotes status via `ingestMessage →
          // setMessagesStatus('has-messages')`, so this doesn't trap a stale
          // empty verdict against future arrivals.
          this.s.setStatus(groupId, 'empty-unconfirmed');
          this.m.retry.scheduleEmpty(groupId);
        }
        // If this is the watched channel, release any background REQs we
        // were holding back to give it priority bandwidth.
        if (groupId === this.s.activeGroupId) this.m.queue.maybeResume();
      },
      {
        affectsRelayAccess: false,
        // The channel in view goes first in the hub's re-issue order on a
        // reconnect and is the last thing its budget parks.
        priority: groupId === this.s.activeGroupId ? 'active' : 'background',
        onQuotaOrRateLimitClose: () => {
          this.m.retry.clear(groupId);
          this.m.forgetSub(groupId);
        },
      },
    );
    this.ctx.track(sub);
    this.s.subByGroup.set(groupId, sub);
  }

  /**
   * Close any existing kind 9 sub for `groupId` and open a fresh one.
   * Does NOT reset the retry counter, used by both the retry ladder
   * (continuing attempts) and `refresh` (which resets
   * the counter before calling this).
   */
  restart(groupId: string): void {
    if (!this.ctx.session()) return;
    const existing = this.s.subByGroup.get(groupId);
    if (existing) {
      try {
        // Release before re-subscribing: the registry CLOSEs the old REQ
        // when its last holder goes, so the fresh subscribe below opens a
        // new one instead of attaching to the stuck one. Every restart used
        // to leave a zombie kind-9 sub hammering the relay, with the user's
        // click answered by whichever REQ the relay served next.
        existing.close();
      } catch {
        // ignore: the relay may already have torn the socket down
      }
      this.s.subByGroup.delete(groupId);
      this.ctx.untrack(existing);
    }
    this.s.subscribedGroups.delete(groupId);
    seedCachedMessagesForGroup(this.m.seedStores, this.ctx.currentRelayUrl.get(), groupId);
    const seedMsgs = this.s.messagesByGroup.get()[groupId] ?? [];
    this.s.setStatus(groupId, seedMsgs.length > 0 ? 'has-messages' : 'loading');
    this.subscribe(groupId);
  }

  /**
   * Force-restart the kind 9 subscription for `groupId` and reset the
   * empty-EOSE retry counter so the user gets a fresh budget of attempts.
   * Use when an external surface needs to recover a stale-empty channel
   * (e.g. a "Reload" button). The active-group switch path also calls
   * this implicitly via `setActiveGroup` when re-entering an
   * empty-confirmed channel.
   */
  refresh(groupId: string): void {
    if (!groupId) return;
    this.m.retry.clear(groupId);
    // An explicit user-driven refresh should also re-arm the querySync
    // fallback, otherwise a channel that was already declared
    // `empty-confirmed` (and fallback-fired) in this session would never
    // get a second querySync shot from a "Reload" tap.
    this.s.querySyncFallbackFired.delete(groupId);
    this.restart(groupId);
  }

  restartStuck(): void {
    // "Stuck" here means anything not yet `has-messages`. Channels in
    // `'loading'` matter too: a sub opened during AUTH-pending often
    // hits the EOSE-then-CLOSED auth-required race AND never reaches
    // EOSE again on its current closure, so it gets stranded in
    // 'loading' (no events, no EOSE, no error to retry on). Refreshing
    // tears down that zombie and opens a fresh REQ on the now-AUTH'd
    // socket.
    const isStuck = (status: MessagesStatus | undefined): boolean =>
      status === 'loading'
      || status === 'empty-unconfirmed'
      || status === 'empty-confirmed';
    const statuses = this.s.messagesStatusByGroup.get();
    const activeGroup = this.s.activeGroupId;
    if (activeGroup && isStuck(statuses[activeGroup])) {
      this.refresh(activeGroup);
    }
    let batched = 0;
    for (const [id, status] of Object.entries(statuses)) {
      if (id === activeGroup) continue;
      if (isStuck(status)) {
        this.refresh(id);
        batched++;
        if (batched >= 5) break;
      }
    }
  }

  stopRetries(): void {
    for (const [id, status] of Object.entries(this.s.messagesStatusByGroup.get())) {
      if (status === 'empty-unconfirmed') this.m.retry.clear(id);
    }
  }
}
