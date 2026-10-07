/**
 * Group membership: admins (kind 39001), members (kind 39002) and creators
 * (kind 9007), the NIP-29 moderation commands that change them, the
 * relay-wide and per-group REQs, and the per-group readiness flag the voice
 * gate reads. Pure move from `client.ts` (round 4 plan, step 12).
 */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { KIND_GROUP_ADMINS, KIND_GROUP_CREATE, KIND_GROUP_MEMBERS } from '@/constants/nostr/nip-kinds';
import { cacheGet, cacheSet } from '../../cache/cache';
import { getAllTags, getTag } from '../../common/event-tags';
import { arraysEqualStrict } from '../metadata/group-metadata';
import { StateStore } from '../../common/state-store';
import type { BridgeContext, TrackedSub } from '../../facade/context';
import { GROUP_SUB_WATCHDOG_MS } from '@/constants/nostr-bridge/groups';
import { MembershipCommands } from './membership-commands';
import { readMembershipSeed } from './membership-seed';

export type MembershipContext = Pick<
  BridgeContext,
  'session' | 'relays' | 'currentRelayUrl' | 'subscribeWatched' | 'track' | 'untrack' | 'closeTracked' | 'signAndPublish'
>;

export interface MembershipDeps {
  /** Only the channel in view warms its members' profiles; see `ingestAdminMember`. */
  isActiveGroup(groupId: string): boolean;
  ensureUserMetadata(pubkey: string): void;
}

export class MembershipModule {
  readonly adminsByGroup = new StateStore<Record<string, string[]>>({});
  readonly membersByGroup = new StateStore<Record<string, string[]>>({});
  /**
   * Per-group flag flipped to `true` once the relay has delivered at least
   * one kind 39001 (admins) or 39002 (members) event for that group. The
   * voice-channel membership gate uses this as positive evidence the relay
   * is actually responding before deciding "not-a-member", without it, a
   * slow NIP-42 round-trip looks identical to "user is not a member" and
   * users have to refresh to recover.
   */
  readonly membershipReadyByGroup = new StateStore<Record<string, boolean>>({});
  /**
   * Map of `groupId -> creator pubkey hex`, derived from the kind 9007 event
   * that created each group. Used by {@link claimCreatorAdmin} to know whether
   * the local user is the creator of a group (so we should publish a kind 9000
   * with `['admin']` if the relay didn't auto-promote them) without spamming
   * kind 9000 publishes for every group on every login.
   */
  readonly groupCreators = new StateStore<Record<string, string>>({});
  private readonly adminMemberSubscribedGroups = new Set<string>();
  private readonly adminMemberSubByGroup = new Map<string, TrackedSub>();
  // Newest `created_at` we've seen for kind-39001 (admins) / kind-39002
  // (members) per group id. Used to drop out-of-order ingests so an older
  // revision arriving second from a slower relay can't clobber the newer
  // list, the symptom of that race is the admin badge / settings gear /
  // members rail flickering on/off until the user refreshes.
  private readonly adminMemberLatestAt = new Map<string, number>();

  /** Join, leave, put-user, remove-user, remove-permission (kinds 9021, 9022, 9000, 9001, 9006). */
  readonly commands: MembershipCommands;

  constructor(
    private readonly ctx: MembershipContext,
    private readonly deps: MembershipDeps,
  ) {
    this.commands = new MembershipCommands(ctx);
  }

  // ---- actions ------------------------------------------------------------
  // The plain NIP-29 commands are `./membership-commands.ts` (`commands`).


  async claimCreatorAdmin(groupId: string): Promise<boolean> {
    const session = this.ctx.session();
    if (!session) return false;
    const me = session.pubKeyHex;
    if (this.groupCreators.get()[groupId] !== me) return false;
    const admins = this.adminsByGroup.get()[groupId] ?? [];
    if (admins.includes(me)) return false;
    // Best-effort background write: if the relay accepts it the local
    // creator becomes a relay-confirmed admin on the next 39001 broadcast;
    // if the relay declines (whitelist, "not authorized to add users"),
    // the user's actual settings/ManageGroup actions will surface the
    // real error. Don't toast for this background attempt.
    await this.commands.putUser(groupId, me, ['admin'], { quiet: true });
    return true;
  }

  /** `createGroup` records its own kind 9007 before the relay echoes it, so `claimCreatorAdmin` works at once. */
  recordCreator(groupId: string, pubkey: string): void {
    this.groupCreators.update((m) => ({ ...m, [groupId]: pubkey }));
    cacheSet(this.ctx.currentRelayUrl.get(), KIND_GROUP_CREATE, groupId, pubkey);
  }

  getAdmins(groupId: string): readonly string[] {
    this.ensurePerGroup(groupId);
    return this.adminsByGroup.get()[groupId] ?? [];
  }

  getMembers(groupId: string): readonly string[] {
    this.ensurePerGroup(groupId);
    return this.membersByGroup.get()[groupId] ?? [];
  }

  // ---- subscriptions -------------------------------------------------------

  /**
   * Single relay-wide subscription for kinds 39001 (admins) and 39002
   * (members) with no `#d` filter. Replaces the per-group fan-out that
   * `ingestGroupMetadata` used to do on every kind 39000, one REQ
   * instead of N. Used to bootstrap the channel-layout author set so
   * operator-or-admin-authored layouts paint without waiting for the
   * user to open every channel. The lazy per-group REQ on
   * useAdmins/useMembers still runs, and is idempotent.
   */
  subscribeRelayWide(): void {
    const filter: Filter = { kinds: [KIND_GROUP_ADMINS, KIND_GROUP_MEMBERS] };
    const sub = this.ctx.subscribeWatched(
      this.ctx.relays(),
      filter,
      (ev) => this.ingestAdminMember(ev),
      undefined,
      { affectsRelayAccess: false, watchdogMs: GROUP_SUB_WATCHDOG_MS },
    );
    this.ctx.track(sub);
  }

  /** The lazy per-group REQ; idempotent. */
  ensurePerGroup(groupId: string): void {
    if (this.adminMemberSubscribedGroups.has(groupId)) return;
    this.adminMemberSubscribedGroups.add(groupId);
    const filter: Filter = {
      kinds: [KIND_GROUP_ADMINS, KIND_GROUP_MEMBERS],
      '#d': [groupId],
    };
    const sub = this.ctx.subscribeWatched(
      this.ctx.relays(),
      filter,
      (ev) => this.ingestAdminMember(ev),
      undefined,
      {
        affectsRelayAccess: false,
        onQuotaOrRateLimitClose: () => {
          // Forget without a CLOSE: the relay already closed it.
          const live = this.adminMemberSubByGroup.get(groupId);
          if (live) this.ctx.untrack(live);
          this.adminMemberSubByGroup.delete(groupId);
          this.adminMemberSubscribedGroups.delete(groupId);
        },
      },
    );
    this.ctx.track(sub);
    this.adminMemberSubByGroup.set(groupId, sub);
  }

  /**
   * Single-REQ pull of every kind 9007 the local user has signed on this
   * relay. Per-group subs cover the general case but rate-limit-shaped
   * relays sometimes drop the burst of 1k+ per-group filters at once,
   * leaving the user's own channels without a known creator. This
   * authors-scoped filter is one REQ regardless of group count and
   * populates `groupCreators` for every group the user actually created
   *, the load-bearing input for the WoT rail's "show my own channels"
   * exemption.
   */
  subscribeMyAuthoredGroups(): void {
    const session = this.ctx.session();
    if (!session) return;
    const filter: Filter = { kinds: [KIND_GROUP_CREATE], authors: [session.pubKeyHex] };
    const sub = this.ctx.subscribeWatched(this.ctx.relays(), filter, (ev) => this.ingestGroupCreator(ev));
    this.ctx.track(sub);
  }

  private ingestGroupCreator(ev: NostrEvent): void {
    const groupId = getTag(ev, 'h');
    if (!groupId) return;
    // Newest-wins isn't meaningful for kind 9007 (a group is created exactly
    // once), but we still guard against mid-flight duplicates so we don't
    // thrash the store.
    const prev = this.groupCreators.get()[groupId];
    if (prev === ev.pubkey) return;
    this.groupCreators.update((m) => ({ ...m, [groupId]: ev.pubkey }));
    cacheSet(this.ctx.currentRelayUrl.get(), KIND_GROUP_CREATE, groupId, ev.pubkey);
  }

  private ingestAdminMember(ev: NostrEvent): void {
    const groupId = getTag(ev, 'd');
    if (!groupId) return;
    // Drop older revisions arriving out-of-order from slower relays. Without
    // this, admins/members lists oscillate as different relays return
    // different snapshots and the React UI flickers (gear icon disappears,
    // members rail empties, etc.) until a refresh.
    const cacheKey = `${ev.kind}:${groupId}`;
    const prevAt = this.adminMemberLatestAt.get(cacheKey) ?? 0;
    if (ev.created_at <= prevAt) return;
    this.adminMemberLatestAt.set(cacheKey, ev.created_at);

    const pubkeys = getAllTags(ev, 'p');
    const store = ev.kind === KIND_GROUP_ADMINS ? this.adminsByGroup : this.membersByGroup;
    store.update((prev) => ({ ...prev, [groupId]: pubkeys }));
    // Persist for next reload, paints instantly before the relay round-trip
    // completes. See cache.ts. Scoped by relay so cross-relay browsing
    // doesn't leak admin lists. Skip the write if the list matches what's
    // already on disk, relays republish identical 39001/39002 events
    // routinely after a reconnect, and localStorage.setItem is a
    // main-thread blocker we'd rather avoid.
    const relay = this.ctx.currentRelayUrl.get();
    const cached = cacheGet<string[]>(relay, ev.kind, groupId);
    if (!cached || !arraysEqualStrict(cached.value, pubkeys)) {
      cacheSet(relay, ev.kind, groupId, pubkeys);
    }
    // Positive signal: the relay has delivered membership data for this
    // group, even if the list is empty. Consumers (voice gate) can now
    // distinguish "not loaded yet" from "loaded and you're not in it".
    this.membershipReadyByGroup.update((prev) =>
      prev[groupId] ? prev : { ...prev, [groupId]: true },
    );
    // Warm profiles only for the channel the user is actually in. This
    // ingest also runs for the relay-wide 39001/39002 REQ
    // ({@link subscribeRelayWide}), which on a public directory relay
    // delivers a membership list for every group hosted there, thousands
    // of distinct pubkeys, none of them on screen. Prefetching all of them
    // is what made opening someone else's relay kill the tab. Members of
    // channels the user hasn't opened resolve lazily instead: rendering a
    // row goes through `subscribeUserMetadata`, which calls
    // `ensureUserMetadata` itself.
    if (this.deps.isActiveGroup(groupId)) {
      pubkeys.forEach((pk) => this.deps.ensureUserMetadata(pk));
    }
  }

  // ---- lifecycle -------------------------------------------------------------

  /** Group ids with a live per-group REQ, for the re-issue list. */
  perGroupSubscribed(): string[] {
    return Array.from(this.adminMemberSubscribedGroups);
  }

  hasPerGroup(groupId: string): boolean {
    return this.adminMemberSubscribedGroups.has(groupId);
  }

  /** The facade closed every REQ: forget the per-group bookkeeping and the newest-wins stamps. */
  forgetSubscriptions(): void {
    this.adminMemberSubscribedGroups.clear();
    this.adminMemberSubByGroup.clear();
    this.adminMemberLatestAt.clear();
  }

  resetLists(): void {
    this.adminsByGroup.set({});
    this.membersByGroup.set({});
  }

  /** The relay has not delivered 39001/39002 on this socket generation yet. */
  resetReadiness(): void {
    this.membershipReadyByGroup.set({});
  }

  resetCreators(): void {
    this.groupCreators.set({});
  }

  /** Paint cached admins, members and creators for `relay`, skipping hidden groups (`./membership-seed.ts`). */
  seedFromCache(relay: string, hiddenGroupIds: ReadonlySet<string>, idsFor: (kind: number) => readonly string[]): void {
    const { admins, members, creators } = readMembershipSeed(relay, hiddenGroupIds, idsFor);
    if (Object.keys(admins).length > 0) this.adminsByGroup.update((prev) => ({ ...admins, ...prev }));
    if (Object.keys(members).length > 0) this.membersByGroup.update((prev) => ({ ...members, ...prev }));
    const readyIds = [...Object.keys(admins), ...Object.keys(members)];
    if (readyIds.length > 0) {
      this.membershipReadyByGroup.update((prev) => {
        const next = { ...prev };
        for (const groupId of readyIds) next[groupId] = true;
        return next;
      });
    }
    if (Object.keys(creators).length > 0) this.groupCreators.update((prev) => ({ ...creators, ...prev }));
  }
}
