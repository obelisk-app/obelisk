/**
 * The empty-EOSE retry ladder for a channel's kind 9 stream (round 4 plan,
 * step 14): auth-gated and silent-filtering relays routinely send an empty
 * EOSE first, so a channel stays `empty-unconfirmed` through
 * `EMPTY_RETRY_DELAYS` restarts and one last focused query before the UI
 * may say "No messages yet". Pure move from `client.ts`.
 */
import type { MessagesContext, MessagesParts } from './module';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { KIND_GROUP_CHAT_MESSAGE } from '@/utils/nostr/nip-kinds';
import { BACKGROUND_MESSAGE_LIMIT, EMPTY_RETRY_DELAYS, type MessagesState } from './state';

export class MessageRetry {
  constructor(
    private readonly s: MessagesState,
    private readonly ctx: MessagesContext,
    private readonly m: MessagesParts,
  ) {}

  /**
   * Drop any pending retry timer for `groupId`. Called when a message
   * arrives (we've proven the channel isn't empty), when the user logs
   * out / switches relay (the sub is going away), and when the retry
   * ladder is exhausted.
   */
  clear(groupId: string): void {
    const entry = this.s.retryByGroup.get(groupId);
    if (entry?.timer) clearTimeout(entry.timer);
    this.s.retryByGroup.delete(groupId);
  }

  /**
   * Drop every pending retry timer. Called on logout / pool reset /
   * relay switch, pending retries are tied to the old pool's filters.
   */
  clearAll(): void {
    for (const entry of this.s.retryByGroup.values()) {
      if (entry.timer) clearTimeout(entry.timer);
    }
    this.s.retryByGroup.clear();
  }

  /**
   * Empty-EOSE retry ladder. Auth-gated and silent-filtering relays
   * routinely send EOSE-empty fast (before AUTH completes, or after a
   * NIP-29 ACL filter dropped every event). Without this, the UI flashes
   * "No messages yet" on a channel that genuinely has history.
   *
   * Each call advances the attempt counter. After
   * {@link EMPTY_RETRY_DELAYS}.length attempts the status is promoted to
   * `empty-confirmed`. If a message arrives at any point, the timer is
   * cancelled and status flips to `has-messages`.
   */
  scheduleEmpty(groupId: string): void {
    if (!this.ctx.session()) return; // logged out, drop the work
    const prior = this.s.retryByGroup.get(groupId);
    const attempts = prior?.attempts ?? 0;
    if (attempts >= EMPTY_RETRY_DELAYS.length) {
      // Hold off on the verdict while NIP-42 AUTH is still in flight on
      // the active relay. The user might be staring at their NIP-46
      // bunker waiting to tap "approve", the chat pane should keep
      // showing the spinner (status = 'empty-unconfirmed' is the right
      // signal for that), not flip to "No messages yet" and bait them
      // into thinking the channel is empty. When AUTH settles,
      // the relay-access AUTH-settled hook fires a fresh REQ via
      // refreshGroupMessages and the verdict will be re-evaluated then.
      // Any non-ok access state is inconclusive; the relay banner explains
      // the failure while the message pane stays noncommittal.
      const relay = this.ctx.currentRelayUrl.get();
      const access = this.ctx.relayAccess.get()[relay];
      const groupIsPublic = this.ctx.groups.get().some((group) => group.id === groupId && group.isPublic);
      if (access !== 'ok' && !groupIsPublic) {
        this.clear(groupId);
        return;
      }
      this.s.setStatus(groupId, 'empty-confirmed');
      this.clear(groupId);
      // Last shot: fire one focused `querySync` for this channel. The
      // live REQ has exhausted its retries against the EOSE-then-CLOSED
      // auth-required race; a fresh querySync goes out as a separate
      // request, by which point the relay's AUTH / whitelist evaluation
      // for this socket has had time to settle. If it returns events,
      // `MessageIngest.ingest` flips status from `empty-confirmed` back
      // to `has-messages`. If it returns empty, the verdict stands.
      // Single-shot per groupId per session, `refreshGroupMessages`
      // clears the flag so an explicit user retry gets another shot.
      if (!this.s.querySyncFallbackFired.has(groupId)) {
        this.s.querySyncFallbackFired.add(groupId);
        void this.querySyncFallback(groupId);
      }
      return;
    }
    const delay = EMPTY_RETRY_DELAYS[attempts];
    if (prior?.timer) clearTimeout(prior.timer);
    const timer = setTimeout(() => {
      const entry = this.s.retryByGroup.get(groupId);
      if (!entry) return; // cleared by a concurrent message / logout
      entry.timer = null;
      entry.attempts += 1;
      this.s.retryByGroup.set(groupId, entry);
      // If a message arrived between scheduling and firing, the entry
      // would already be cleared by `clearMessagesRetry`. Guard anyway.
      const msgs = this.s.messagesByGroup.get()[groupId] ?? [];
      if (msgs.length > 0) {
        this.s.setStatus(groupId, 'has-messages');
        this.clear(groupId);
        return;
      }
      // Restart the sub so the relay sees a fresh REQ, most likely to
      // unstick auth-gated relays whose AUTH handshake finished after
      // the initial EOSE-empty.
      this.m.stream.restart(groupId);
    }, delay);
    this.s.retryByGroup.set(groupId, { attempts, timer });
  }

  /**
   * Cold-load fallback for the kind 9 stream. Fires after the retry
   * ladder has exhausted (status is currently `empty-confirmed`). Sends
   * one focused `pool.querySync` with a longer maxWait than the live
   * REQ retries used, so the relay gets a final chance to serve history
   * once AUTH and whitelist evaluation have had time to settle.
   *
   * On success: events are ingested through `MessageIngest.ingest`, which
   * flips status to `has-messages`, clears the retry tracking, AND
   * triggers a cache write so subsequent reloads paint instantly.
   * On empty / error: the `empty-confirmed` verdict already set by the
   * caller stands, no further action needed.
   */
  async querySyncFallback(groupId: string): Promise<void> {
    if (!this.ctx.session()) return;
    const filter: Filter = {
      kinds: [KIND_GROUP_CHAT_MESSAGE],
      '#h': [groupId],
      limit: BACKGROUND_MESSAGE_LIMIT,
    };
    let events: NostrEvent[];
    try {
      // Bypass the result cache: this runs because the live REQ came back
      // empty, so a cached answer (very likely that same empty) would turn
      // the retry into a no-op. The retry exists to ask the wire again.
      events = (await this.ctx.queryRelaysWithConfidence(this.ctx.relays(), filter, 6000, { cache: 'bypass' })).events;
    } catch {
      return;
    }
    // Session may have ended between dispatch and resolution, silently
    // drop any results that arrived for a dead pool. Also bail if the
    // user has since switched to a different active channel and an
    // unrelated path already flipped status (don't fight ingest races).
    if (!this.ctx.session()) return;
    if (events.length === 0) return;
    for (const ev of events) this.m.ingestor.ingest(groupId, ev);
  }

  /**
   * @internal Test seam. Number of empty-EOSE retries already executed for
   * `groupId`, or `null` when no retry ladder is being tracked for it. The
   * bridge tests need exactly this one fact; exposing it here keeps the Map
   * and the timer handle private.
   */
  attempts(groupId: string): number | null {
    return this.s.retryByGroup.get(groupId)?.attempts ?? null;
  }
}
