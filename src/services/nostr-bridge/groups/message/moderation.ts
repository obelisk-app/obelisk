/**
 * Deletions: NIP-09 (kind 5, the author's own) and NIP-29 moderation
 * (kind 9005, an admin's), the per-group REQs for them, the tombstone sets
 * messages and reactions consult before ingesting, and the command. Pure
 * move from `client.ts` (round 4 plan, step 13), with the plan's one wiring
 * change: this module owns only the id sets and asks messages and reactions
 * to drop their own rows (`removeMessages`, `removeReactions`) instead of
 * writing into their stores.
 */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { KIND_EVENT_DELETION, KIND_GROUP_DELETE_EVENT } from '@/constants/nostr/nip-kinds';
import { BoundedMap, BoundedSet } from '@nostr-wot/relay/hub';
import type { BridgeContext, TrackedSub } from '../../facade/context';
import { MAX_TOMBSTONES } from '@/constants/nostr-bridge/groups';

const tombstoneKey = (groupId: string, eventId: string): string => `${groupId}|${eventId}`;

export type ModerationContext = Pick<
  BridgeContext,
  'relays' | 'subscribeWatched' | 'track' | 'untrack' | 'closeTracked' | 'signAndPublish'
>;

export interface ModerationDeps {
  /**
   * Drop the named messages from the channel's store, only the author's
   * when `author` is set; returns the ids actually removed. The messages
   * module flushes its own cache.
   */
  removeMessages(groupId: string, ids: ReadonlySet<string>, author: string | null): Set<string>;
  /** Drop reactions by id (the author's only when set) and every reaction on `deletedTargets`; see `ReactionsModule.removeDeleted`. */
  removeReactions(
    groupId: string,
    ids: ReadonlySet<string>,
    author: string | null,
    deletedTargets: ReadonlySet<string>,
    messagesChanged: boolean,
  ): void;
}

export class ModerationModule {
  /** `groupId|eventId` -> author who deleted it, from kind 5. */
  private readonly deletedByAuthor = new BoundedMap<string, string>({ maxEntries: MAX_TOMBSTONES, policy: 'fifo' });
  /** `groupId|eventId` an admin removed, from kind 9005. */
  private readonly moderated = new BoundedSet<string>(MAX_TOMBSTONES);
  private readonly eventDeletionSubscribedGroups = new Set<string>();
  private readonly eventDeletionSubByGroup = new Map<string, TrackedSub>();
  private readonly moderationDeletionSubscribedGroups = new Set<string>();
  private readonly moderationDeletionSubByGroup = new Map<string, TrackedSub>();

  constructor(
    private readonly ctx: ModerationContext,
    private readonly deps: ModerationDeps,
  ) {}

  // ---- command ------------------------------------------------------------

  async deleteGroupEvent(groupId: string, eventId: string): Promise<void> {
    const event = await this.ctx.signAndPublish({
      kind: KIND_GROUP_DELETE_EVENT,
      content: '',
      tags: [['h', groupId], ['e', eventId]],
      created_at: Math.floor(Date.now() / 1000),
    });
    this.ingestGroupEventDeletion(groupId, event);
  }

  // ---- predicates ---------------------------------------------------------

  isModerated(groupId: string, eventId: string): boolean {
    return this.moderated.has(tombstoneKey(groupId, eventId));
  }

  isDeletedByAuthor(groupId: string, eventId: string, pubkey: string): boolean {
    return this.deletedByAuthor.peek(tombstoneKey(groupId, eventId)) === pubkey;
  }

  // ---- the per-group REQs -------------------------------------------------

  ensureEventDeletions(groupId: string): void {
    if (this.eventDeletionSubscribedGroups.has(groupId)) return;
    this.eventDeletionSubscribedGroups.add(groupId);
    const deletionFilter: Filter = { kinds: [KIND_EVENT_DELETION], '#h': [groupId], limit: 500 };
    const deletionSub = this.ctx.subscribeWatched(
      this.ctx.relays(),
      deletionFilter,
      (ev) => this.ingestEventDeletion(groupId, ev),
      undefined,
      {
        watchdogMs: 3000,
        affectsRelayAccess: false,
        onQuotaOrRateLimitClose: () => {
          this.forgetPerGroup(groupId, this.eventDeletionSubscribedGroups, this.eventDeletionSubByGroup);
        },
      },
    );
    this.ctx.track(deletionSub);
    this.eventDeletionSubByGroup.set(groupId, deletionSub);
  }

  /** Kind 9005 stream per channel. Nothing opens it today: the messages REQ carries kind 9005 alongside kind 9. */
  ensureModerationDeletions(groupId: string): void {
    if (this.moderationDeletionSubscribedGroups.has(groupId)) return;
    this.moderationDeletionSubscribedGroups.add(groupId);
    const deletionFilter: Filter = { kinds: [KIND_GROUP_DELETE_EVENT], '#h': [groupId], limit: 500 };
    const deletionSub = this.ctx.subscribeWatched(
      this.ctx.relays(),
      deletionFilter,
      (ev) => this.ingestGroupEventDeletion(groupId, ev),
      undefined,
      {
        watchdogMs: 3000,
        affectsRelayAccess: false,
        onQuotaOrRateLimitClose: () => {
          this.forgetPerGroup(groupId, this.moderationDeletionSubscribedGroups, this.moderationDeletionSubByGroup);
        },
      },
    );
    this.ctx.track(deletionSub);
    this.moderationDeletionSubByGroup.set(groupId, deletionSub);
  }

  /** Forget without a CLOSE: the relay already closed it. */
  private forgetPerGroup(groupId: string, subscribed: Set<string>, byGroup: Map<string, TrackedSub>): void {
    const sub = byGroup.get(groupId);
    if (sub) this.ctx.untrack(sub);
    byGroup.delete(groupId);
    subscribed.delete(groupId);
  }

  // ---- ingest -------------------------------------------------------------

  /** NIP-09: the author deletes their own events. */
  ingestEventDeletion(groupId: string, ev: NostrEvent): void {
    const ids = ev.tags
      .filter((tag) => tag[0] === 'e' && tag[1])
      .map((tag) => tag[1]);
    if (ids.length === 0) return;

    for (const id of ids) this.deletedByAuthor.set(tombstoneKey(groupId, id), ev.pubkey);

    const idSet = new Set(ids);
    const deletedMessageIds = this.deps.removeMessages(groupId, idSet, ev.pubkey);
    this.deps.removeReactions(groupId, idSet, ev.pubkey, deletedMessageIds, deletedMessageIds.size > 0);
  }

  /** NIP-29 kind 9005: an admin removes events from the group. */
  ingestGroupEventDeletion(groupId: string, ev: NostrEvent): void {
    const ids = ev.tags
      .filter((tag) => tag[0] === 'e' && tag[1])
      .map((tag) => tag[1]);
    if (ids.length === 0) return;

    for (const id of ids) this.moderated.add(tombstoneKey(groupId, id));

    const idSet = new Set(ids);
    this.deps.removeMessages(groupId, idSet, null);
    this.deps.removeReactions(groupId, idSet, null, idSet, false);
  }

  // ---- lifecycle ----------------------------------------------------------

  /** Session reset and relay switch: the REQs were released by the caller; forget the bookkeeping. */
  forgetSubscriptions(): void {
    this.eventDeletionSubscribedGroups.clear();
    this.eventDeletionSubByGroup.clear();
    this.moderationDeletionSubscribedGroups.clear();
    this.moderationDeletionSubByGroup.clear();
  }

  /** Tombstones held now, both classes; for the bound test. */
  tombstoneCount(): number {
    return this.deletedByAuthor.size + this.moderated.size;
  }

  /** Relay switch and dispose: tombstones are per relay. */
  reset(): void {
    this.deletedByAuthor.clear();
    this.moderated.clear();
  }
}
