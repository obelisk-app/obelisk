/**
 * The kind 9 REQ queue (round 4 plan, step 14): channels discovered by the
 * kind 39000 fan-out wait here and open in small batches, the channel in
 * view jumps the queue and holds the drain until its first EOSE or event
 * (bounded by `ACTIVE_PRIORITY_MAX_PAUSE_MS`), and background streams are
 * capped at `MAX_BACKGROUND_MESSAGE_STREAMS`. Pure move from `client.ts`.
 */
import type { MessagesContext, MessagesParts } from './module';
import { seedCachedMessagesForGroup } from './seed';
import type { MessagesState } from './state';
import { ACTIVE_PRIORITY_MAX_PAUSE_MS, MAX_BACKGROUND_MESSAGE_STREAMS } from '@/constants/nostr-bridge/groups';

export class MessageQueue {
  constructor(
    private readonly s: MessagesState,
    private readonly ctx: MessagesContext,
    private readonly m: MessagesParts,
  ) {}

  /**
   * Background entry-point used by the metadata ingest for groups
   * the user has *not* explicitly opened. Defers the kind 9 REQ to a small
   * batch processed off-tick so the channel currently in view gets the
   * relay's first response. Already-subscribed and currently-active groups
   * are no-ops here, they're handled by direct `MessageStream.subscribe`
   * calls.
   */
  queue(groupId: string): void {
    if (this.s.subscribedGroups.has(groupId)) return;
    if (this.s.pendingSet.has(groupId)) return;
    if (groupId === this.s.activeGroupId) {
      // The active group always gets its REQ immediately, even if metadata
      // arrived later than the user's click, this is the whole point of
      // the queue.
      this.m.stream.subscribe(groupId);
      return;
    }
    if (this.backgroundCount() >= MAX_BACKGROUND_MESSAGE_STREAMS) return;
    this.s.pendingSet.add(groupId);
    this.s.pendingQueue.push(groupId);
    this.scheduleDrain();
  }

  scheduleDrain(): void {
    if (this.s.pendingTimer) return;
    // Strict active-channel priority: while the watched channel's kind 9
    // sub is still in `loading` (no EOSE, no events), hold all background
    // REQs back. The active sub's own EOSE / first-event handler calls
    // `maybeResume` to release the queue. Without
    // this gate, the relay's response queue interleaves the active
    // channel's history with N background channels' histories, making
    // the user wait visibly while watching one channel that already has
    // the data in flight.
    if (this.isActiveStillLoading()) return;
    // Small delay so the active group's REQ (fired synchronously when the
    // user clicks a channel) lands before the relay sees a flood of
    // background REQs. Longer than a microtask so React's render commit
    // can settle first; short enough that background unread badges still
    // populate within ~1s on a heavy relay.
    this.s.pendingTimer = setTimeout(() => {
      this.s.pendingTimer = null;
      this.drain();
    }, 80);
  }

  /**
   * Re-arm the background drain when the active channel transitions out
   * of `loading` (its EOSE arrived, or its first event was ingested).
   * No-op if the queue is empty or the active channel is still loading.
   */
  maybeResume(): void {
    if (this.s.pendingQueue.length === 0) return;
    if (this.isActiveStillLoading()) return;
    this.scheduleDrain();
  }

  /**
   * True iff the user is watching a channel whose kind 9 stream has not
   * yet produced either an EOSE or a message AND the priority deadline
   * has not yet elapsed. Used to gate background REQs so the watched
   * channel always gets the relay's first attention, but bounded by
   * {@link ACTIVE_PRIORITY_MAX_PAUSE_MS} so a silent active sub can't
   * starve every other channel.
   */
  isActiveStillLoading(): boolean {
    const id = this.s.activeGroupId;
    if (!id) return false;
    if (Date.now() >= this.s.priorityDeadline) return false;
    const status = this.s.messagesStatusByGroup.get()[id];
    return !status || status === 'loading';
  }

  drain(): void {
    // Race guard: the active group's status may have flipped back to
    // 'loading' while the 80ms drain timer was pending (e.g. user clicked
    // a new channel just before the timer fired). Bail in that case;
    // `maybeResume` will pick up when the new
    // active channel's EOSE / first event lands.
    if (this.isActiveStillLoading()) return;
    // Always promote the active group to the head of the queue if it
    // happens to be sitting in there, handles the case where the user
    // switched channels while a background batch was in flight.
    if (this.s.activeGroupId && this.s.pendingSet.has(this.s.activeGroupId)) {
      this.s.pendingSet.delete(this.s.activeGroupId);
      this.s.pendingQueue = this.s.pendingQueue.filter((id) => id !== this.s.activeGroupId);
      if (!this.s.subscribedGroups.has(this.s.activeGroupId)) {
        this.m.stream.subscribe(this.s.activeGroupId);
      }
    }
    const BATCH = 4;
    let processed = 0;
    while (this.s.pendingQueue.length > 0 && processed < BATCH) {
      if (this.backgroundCount() >= MAX_BACKGROUND_MESSAGE_STREAMS) {
        this.s.pendingQueue = [];
        this.s.pendingSet.clear();
        break;
      }
      const id = this.s.pendingQueue.shift()!;
      this.s.pendingSet.delete(id);
      if (!this.s.subscribedGroups.has(id)) {
        this.m.stream.subscribe(id);
        processed++;
      }
    }
    if (this.s.pendingQueue.length > 0) {
      this.scheduleDrain();
    }
  }

  backgroundCount(): number {
    let count = 0;
    for (const groupId of this.s.subscribedGroups) {
      if (groupId !== this.s.activeGroupId) count++;
    }
    return count;
  }

  /**
   * Move `groupId` to the head of the pending message queue (or fire its
   * REQ immediately if it isn't queued yet). Called by `setActiveGroup`
   * when the user clicks a channel, it ensures the channel currently in
   * view always wins the relay's attention, even if hundreds of other
   * groups are queued ahead of it from the kind 39000 fan-out.
   *
   * If the channel is already subscribed but hasn't loaded ("loading" /
   * "empty-unconfirmed" / "empty-confirmed"), the existing sub is torn
   * down and a fresh one is opened. The background drain typically
   * subscribes every visible channel from kind 39000 fan-out, those
   * subs land on a still-AUTH-ing socket and routinely get stuck in
   * the EOSE-then-CLOSED auth-required race. The user's click is the
   * canonical signal to retry from scratch with the active-channel
   * priority gate engaged. Channels in 'has-messages' are left alone,
   * a successful sub is delivering live updates and replacing it would
   * just churn the relay.
   */
  bumpPriority(groupId: string): void {
    if (this.s.subscribedGroups.has(groupId)) {
      const status = this.s.messagesStatusByGroup.get()[groupId];
      if (status === 'has-messages') return;
      // Stuck, restart so the user's click gets a fresh REQ on the
      // (likely now AUTH'd) socket. refreshGroupMessages also resets
      // the retry counter and re-arms the querySync fallback flag.
      this.m.stream.refresh(groupId);
      // Defense in depth: fire a parallel `querySync` immediately,
      // don't wait for the retry ladder to exhaust. The live REQ
      // restart above sometimes wedges on the same conditions that
      // had the previous sub stuck (relay-side per-REQ AUTH quirks,
      // SimplePool dedup of identical filters on the same socket,
      // etc.). A querySync goes out as a separate frame and has its
      // own response window, events it returns flow through
      // ingestMessage and unstick the chat pane without the user
      // having to refresh the page.
      this.s.querySyncFallbackFired.add(groupId);
      void this.m.retry.querySyncFallback(groupId);
      return;
    }
    if (this.s.pendingSet.has(groupId)) {
      this.s.pendingSet.delete(groupId);
      this.s.pendingQueue = this.s.pendingQueue.filter((id) => id !== groupId);
    }
    this.m.stream.subscribe(groupId);
  }

  setActiveGroup(groupId: string | null): void {
    const previousActive = this.s.activeGroupId;
    this.s.activeGroupId = groupId;
    // The hub re-issues REQs in priority order after a drop: the channel in
    // view moves to the front, the one leaving it back to the background.
    if (previousActive && previousActive !== groupId) this.s.subByGroup.get(previousActive)?.setPriority?.('background');
    if (groupId) this.s.subByGroup.get(groupId)?.setPriority?.('active');
    // Reset the priority deadline + arm a force-release timer. See
    // {@link ACTIVE_PRIORITY_MAX_PAUSE_MS} for the rationale.
    if (this.s.priorityTimer) {
      clearTimeout(this.s.priorityTimer);
      this.s.priorityTimer = null;
    }
    if (groupId) {
      this.s.priorityDeadline = Date.now() + ACTIVE_PRIORITY_MAX_PAUSE_MS;
      this.s.priorityTimer = setTimeout(() => {
        this.s.priorityTimer = null;
        // Deadline passed, release the gate even if status is still
        // 'loading'. If there's pending background work, drain it now;
        // otherwise this is a no-op.
        this.maybeResume();
      }, ACTIVE_PRIORITY_MAX_PAUSE_MS);
    } else {
      this.s.priorityDeadline = 0;
    }
    // Switching away from a still-loading channel? Resume the background
    // queue drain so other channels' subs aren't held forever.
    if (previousActive && previousActive !== groupId) {
      this.maybeResume();
    }
    if (!groupId) return;
    seedCachedMessagesForGroup(this.m.seedStores, this.ctx.currentRelayUrl.get(), groupId);
    // Re-entering a channel that was previously declared empty-confirmed
    // is the canonical "stale empty" recovery path. The bridge owns this
    // restart so the UI never has to fire its own refresh effect.
    const msgs = this.s.messagesByGroup.get()[groupId] ?? [];
    const currentStatus = this.s.messagesStatusByGroup.get()[groupId];
    if (currentStatus === 'empty-confirmed' && msgs.length === 0) {
      this.m.retry.clear(groupId);
      this.m.stream.restart(groupId);
      return;
    }
    // Fast-track the channel the user just clicked: if the kind 9 REQ
    // hasn't been fired yet (because metadata is still streaming or this
    // group was sitting in the background queue from the kind 39000
    // fan-out), promote it now so the relay's first response is the
    // channel actually in view.
    this.bumpPriority(groupId);
  }
}
