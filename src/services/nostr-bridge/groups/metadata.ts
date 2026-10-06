/**
 * Group metadata (kind 39000): the channel list, the parent/child index the
 * sidebar nests by, the EOSE flag with its bounded empty-retry ladder and
 * query fallback, and the on-demand fetch; the create/edit commands are
 * `./metadata-commands.ts`. The newest-wins guard
 * (`groupMetadataLatestAt`) is cleared on every session reset: a re-login
 * delivers the same replaceable events with the same `created_at`, and
 * without the clear every one of them is dropped (login-race Fix E).
 */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { KIND_GROUP_METADATA } from '@/utils/nip-kinds';
import { cacheGet, cacheSet } from '../cache';
import { groupEqual, parseGroupMetadataTags } from '../group-metadata';
import { StateStore } from '../state-store';
import type { BridgeContext } from '../context';
import type { JsGroup } from '../types';
import { GROUP_SUB_WATCHDOG_MS } from './watchdog';
import { MetadataEoseLadder } from './metadata-eose';
import { GroupNesting } from './nesting';
import { createGroup, editGroupMetadata } from './metadata-commands';
import type { CreateGroupOptions, EditGroupMetadataOptions } from './metadata-tags';

export type GroupMetadataContext = Pick<
  BridgeContext,
  'session' | 'relays' | 'currentRelayUrl' | 'subscribeWatched' | 'track' | 'queryRelaysWithConfidence' | 'signAndPublish'
>;

export interface GroupMetadataDeps {
  /** `createGroup` records the creator locally so `claimCreatorAdmin` works before the relay echoes the kind 9007. */
  recordCreator(groupId: string, pubkey: string): void;
  /** A channel's metadata arrived: the messages module starts (or queues) its kind 9 stream. */
  onGroupDiscovered(groupId: string): void;
}

export type { CreateGroupOptions, EditGroupMetadataOptions } from './metadata-tags';

export class GroupMetadataModule {
  readonly groups = new StateStore<JsGroup[]>([]);
  /**
   * `true` once the relay has emitted EOSE for the global kind 39000 sub on
   * the active relay. Lets the empty-state UI distinguish "still loading"
   * from "relay confirmed zero groups visible to me", the latter being the
   * classic whitelist symptom on relays that don't send a CLOSED reason.
   */
  readonly groupMetadataEose = new StateStore<boolean>(false);
  /** The category tree the sidebar nests by (`./nesting.ts`). */
  private readonly nesting = new GroupNesting();
  get childrenByParent(): StateStore<Record<string, string[]>> { return this.nesting.childrenByParent; }
  // Same newest-wins guard for kind 39000 (group metadata) so an older
  // revision from a slow relay can't overwrite a fresher one. Also lets
  // the cached seed survive against stale events still in flight.
  private readonly groupMetadataLatestAt = new Map<string, number>();
  /** The bounded empty-EOSE retry ladder and its query fallback (`./metadata-eose.ts`). */
  private readonly eose: MetadataEoseLadder;

  constructor(
    private readonly ctx: GroupMetadataContext,
    private readonly deps: GroupMetadataDeps,
  ) {
    this.eose = new MetadataEoseLadder(ctx, {
      groups: this.groups,
      groupMetadataEose: this.groupMetadataEose,
      ingest: (ev) => this.ingest(ev),
    });
  }

  // ---- actions ------------------------------------------------------------

  /** Create a channel (kind 9007) and set its metadata (`./metadata-commands.ts`). */
  createGroup(opts: CreateGroupOptions): Promise<string> {
    return createGroup(this.ctx, (groupId, pubkey) => this.deps.recordCreator(groupId, pubkey), opts);
  }

  /** Edit a channel's metadata (kind 9002). */
  editGroupMetadata(opts: EditGroupMetadataOptions): Promise<void> {
    return editGroupMetadata(this.ctx, opts);
  }

  /**
   * Fetch a single group's kind 39000 metadata on demand. Used by the chat
   * pane when it mounts onto a `groupId` that isn't in the `groups` store
   * yet: the global metadata stream is supposed to catch every group, but
   * slow / silent-filtering relays can miss specific ids for a session. A
   * focused query with `#d:[groupId]` gives the relay exactly one event to
   * deliver and unblocks the chat pane without waiting for a full page
   * refresh.
   *
   * Returns `true` when at least one previously-unseen 39000 event was
   * ingested.
   */
  async fetchGroupMetadata(groupId: string): Promise<boolean> {
    if (!groupId) return false;
    const filter: Filter = {
      kinds: [KIND_GROUP_METADATA],
      '#d': [groupId],
      limit: 1,
    };
    const { events } = await this.ctx.queryRelaysWithConfidence(this.ctx.relays(), filter, 4000);
    let added = 0;
    for (const ev of events) {
      const before = this.groups.get().length;
      this.ingest(ev);
      const after = this.groups.get().length;
      if (after > before) added++;
    }
    return added > 0;
  }

  // ---- the relay-wide REQ -------------------------------------------------

  subscribe(): void {
    const filter: Filter = { kinds: [KIND_GROUP_METADATA] };
    const sub = this.ctx.subscribeWatched(
      this.ctx.relays(),
      filter,
      (ev) => this.ingest(ev),
      () => this.eose.handleEose(),
      { watchdogMs: GROUP_SUB_WATCHDOG_MS },
    );
    this.ctx.track(sub);
  }

  // ---- ingest -------------------------------------------------------------

  ingest(ev: NostrEvent): void {
    // Single-pass parse: see {@link parseGroupMetadataTags} for the
    // tag-precedence rules (preserved bit-for-bit from the previous
    // multi-scan version).
    const t = parseGroupMetadataTags(ev.tags);
    const groupId = t.d;
    if (!groupId) return;
    // Drop older revisions arriving out-of-order from slower relays so the
    // sidebar doesn't oscillate. The cached seed (with its own created_at)
    // also participates in this guard.
    const prevAt = this.groupMetadataLatestAt.get(groupId) ?? 0;
    if (ev.created_at <= prevAt) return;
    this.groupMetadataLatestAt.set(groupId, ev.created_at);
    const next: JsGroup = {
      id: groupId,
      name: t.name ?? null,
      about: t.about ?? null,
      picture: t.picture ?? null,
      banner: t.banner ?? null,
      isPublic: t.isPublic,
      isHidden: t.isHidden,
      isRestricted: t.isRestricted,
      isOpen: t.isOpen,
      parent: t.parent ?? null,
      kind: t.channelKind,
      forumTags: t.forumTags,
      topics: t.topics,
    };
    const parent = next.parent;
    this.groups.update((prev) => {
      const filtered = prev.filter((g) => g.id !== groupId);
      return [...filtered, next].sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
    });
    this.eose.clear();
    // Persist for next reload: the sidebar paints channels instantly before
    // the live REQ round-trip completes. Store the snapshot together with
    // its created_at so the seed can re-establish the newest-wins guard.
    // Skip the write when the on-disk payload already matches: a
    // republished 39000 with the same fields under a newer created_at is
    // common (admin re-publishes for liveness), and avoiding the
    // localStorage.setItem keeps the main thread from blocking.
    {
      const relay = this.ctx.currentRelayUrl.get();
      const cached = cacheGet<{ group: JsGroup; createdAt: number }>(relay, KIND_GROUP_METADATA, groupId);
      if (!cached || !groupEqual(cached.value.group, next)) {
        cacheSet(relay, KIND_GROUP_METADATA, groupId, {
          group: next,
          createdAt: ev.created_at,
        });
      }
    }
    // Start streaming messages immediately so opening the channel doesn't
    // wait on a fresh REQ round-trip: the store already has them. The
    // per-group REQ caps at BACKGROUND_MESSAGE_LIMIT; older history is
    // paged via loadMoreMessages. Queued (rather than fired inline) so
    // the channel the user is actively viewing wins the relay's first
    // response; see the messages module's queue.
    this.deps.onGroupDiscovered(groupId);
    // Admin/member (39001/39002) is intentionally NOT fanned out here.
    // Subscribing to every discovered group on login was expensive on
    // accounts that belong to many channels and slowed setup of recently
    // created groups (the user wants those to feel instant). Per-group
    // admin/member REQs now open lazily on first useAdmins / useMembers
    // call from the chat panel. Tradeoff: the sidebar's "I'm an admin of
    // X" badge no longer paints before opening each channel, acceptable
    // given the load-time win. See docs/data-system.md.
    // Per-group creator REQs are intentionally not fanned out here. The
    // global authored-groups subscription covers the only write path that
    // needs this eagerly (claiming admin on groups the local user created).
    // Maintain parent -> children index so the sidebar can render nesting.
    this.nesting.move(groupId, parent);
  }

  // ---- cache seed ---------------------------------------------------------

  /**
   * Paint the cached channel list for `relay` ahead of the live REQ. Hidden
   * channels are revalidated live on every login and never painted from a
   * previous identity/membership snapshot; their ids are returned so the
   * other seeds skip them too. `renderable` says whether anything painted.
   */
  seedFromCache(relay: string, idsFor: (kind: number) => string[]): { hiddenGroupIds: Set<string>; renderable: boolean } {
    let renderable = false;
    const hiddenGroupIds = new Set<string>();
    const cachedGroups: JsGroup[] = [];
    const cachedChildren: Record<string, string[]> = {};
    for (const groupId of idsFor(KIND_GROUP_METADATA)) {
      const entry = cacheGet<{ group: JsGroup; createdAt: number }>(relay, KIND_GROUP_METADATA, groupId);
      if (!entry) continue;
      const { group: cached, createdAt } = entry.value;
      const group: JsGroup = {
        ...cached,
        isHidden: cached.isHidden ?? !cached.isPublic,
        isRestricted: cached.isRestricted ?? !cached.isOpen,
        forumTags: cached.forumTags ?? [],
        topics: cached.topics ?? [],
      };
      // Hidden channels are revalidated live on every login. Never paint
      // their names or content from a previous identity/membership snapshot.
      if (group.isHidden) {
        hiddenGroupIds.add(groupId);
        continue;
      }
      this.groupMetadataLatestAt.set(
        groupId,
        Math.max(this.groupMetadataLatestAt.get(groupId) ?? 0, createdAt),
      );
      this.nesting.setParent(groupId, group.parent ?? null);
      cachedGroups.push(group);
      renderable = true;
      if (group.parent) (cachedChildren[group.parent] ??= []).push(groupId);
    }
    if (cachedGroups.length > 0) {
      this.groups.update((prev) => {
        const present = new Set(prev.map((group) => group.id));
        const added = cachedGroups.filter((group) => !present.has(group.id));
        return added.length === 0
          ? prev
          : [...prev, ...added].sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
      });
      this.nesting.mergeChildren(cachedChildren);
    }
    return { hiddenGroupIds, renderable };
  }

  // ---- lifecycle ----------------------------------------------------------
  // Four small methods rather than one `reset(scope)`: the facade's
  // lifecycle paths interleave these with other modules' resets, and the
  // store-notification order is kept exactly as it was.

  /** Logout and relay switch: the list belongs to the relay (and the identity) being left. */
  clearGroups(): void {
    this.groups.set([]);
  }

  /**
   * Session reset and relay switch: forget the newest-wins cursors. Kind
   * 39000 is replaceable, and the next session's (or relay's) REQ delivers
   * the SAME events with the SAME created_at the guard just memorized; without
   * this every one of them is dropped and the sidebar stays empty until the
   * user toggles relays or refreshes.
   */
  forgetRevisions(): void {
    this.groupMetadataLatestAt.clear();
  }

  /**
   * The EOSE flag goes back to "loading" so the empty-state UI shows
   * "Channels loading..." while the new REQ is in flight, not the stale
   * "No channels found" / "Whitelisting required" text computed off a
   * previous session's EOSE, and the empty-retry ladder restarts.
   */
  resetEose(): void {
    this.groupMetadataEose.set(false);
    this.eose.clear();
  }

  /** Relay switch: the nesting index is per relay (the same `d` tag can exist on two relays independently). */
  resetChildren(): void {
    this.nesting.reset();
  }
}
