/**
 * The session's own lists: contact list (kind 3) and mute list (kind 10000),
 * plus the wiring that feeds the WoT engine its own-pubkey, mute and block
 * sets. Pure move from `client.ts` (round 4 plan, step 8).
 */
import { CodedError } from '@/utils/errors/codes';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { KIND_CONTACT_LIST, KIND_MUTE_LIST } from '@/utils/nostr/nip-kinds';
import { getPreferences } from '@/services/preferences/preferences';
import { wotEngine } from '@/services/wot/engine';
import { useModerationStore } from '@/store/moderation';
import { cacheGet, cacheSet } from '../cache/cache';
import { getAllTags } from '../common/event-tags';
import { PROFILE_RELAYS, newestEvent } from '../profile/profile-sync-cache';
import { StateStore } from '../common/state-store';
import type { BridgeContext } from '../facade/context';

export type ListsContext = Pick<
  BridgeContext,
  'session' | 'relays' | 'myPubkey' | 'dmsByPeer' | 'subscribeWatched' | 'track' | 'queryRelaysWithConfidence' | 'signAndPublish'
>;

export class ListsModule {
  readonly myContactList = new StateStore<NostrEvent | null>(null);
  readonly myContactListReady = new StateStore(false);
  private myContactListLatestAt = 0;
  /**
   * NIP-51 kind 10000 mute list: pubkeys the local user has muted (public
   * `p` tags only; encrypted entries in `content` are not yet decrypted).
   * Consumers filter messages and DMs against this set so muted authors'
   * content disappears from the UI without affecting relay storage.
   */
  readonly myMutes = new StateStore<string[]>([]);

  constructor(private readonly ctx: ListsContext) {}

  /**
   * Connect the WoT engine to the bridge (called once from the facade's
   * constructor):
   *   - Consensual-DM exemption: any peer we have a cached DM thread with
   *     bypasses the gate (you opted in by talking to them).
   *   - Synced mute list (NIP-51 kind 10000) + local zustand mute list →
   *     engine's union via {@link syncMutesToEngine}.
   *   - Local zustand block list → engine's hard denylist.
   *
   * Important: WoT/mute/block verdicts are non-destructive. They gate future
   * ingestion/rendering decisions, but they must not wipe cached messages,
   * DMs, metadata, channels, admins, or members. Only explicit relay/user
   * delete/moderation events are allowed to remove user-visible data.
   */
  wireWotEngine(): void {
    this.ctx.myPubkey.subscribe((pk) => wotEngine.setOwnPubkey(pk));
    wotEngine.setConsensualDmPredicate((pubkey) => {
      const peers = this.ctx.dmsByPeer.get();
      return Object.prototype.hasOwnProperty.call(peers, pubkey);
    });
    this.myMutes.subscribe(() => this.syncMutesToEngine());
    if (typeof window !== 'undefined') {
      useModerationStore.subscribe(() => this.syncMutesToEngine());
      this.syncMutesToEngine();
    }
  }

  private syncMutesToEngine(): void {
    const local = (typeof window !== 'undefined') ? useModerationStore.getState() : null;
    const synced = this.myMutes.get();
    const muteUnion = new Set<string>([...(synced ?? []), ...(local?.mutedPubkeys ?? [])]);
    wotEngine.setMutedPubkeys(Array.from(muteUnion));
    wotEngine.setBlockedPubkeys(local?.blockedPubkeys ?? []);
  }

  isMuted(pubkey: string): boolean {
    return this.myMutes.get().includes(pubkey);
  }

  async setMuted(pubkey: string, muted: boolean): Promise<void> {
    const session = this.ctx.session();
    if (!session) throw new CodedError('not-logged-in', 'Not logged in');
    const me = session.pubKeyHex;
    const muteRelays = Array.from(new Set([...this.ctx.relays(), ...PROFILE_RELAYS]));

    // Pull the latest kind 10000 so we don't drop encrypted content or
    // non-`p` tags published by other clients. Bypass the result cache:
    // this is a read-before-write, so it must be the newest list on the
    // wire, and it is stale as soon as the new list publishes.
    const muteQuery = await this.ctx.queryRelaysWithConfidence(
      muteRelays,
      { kinds: [KIND_MUTE_LIST], authors: [me], limit: 1 },
      4000,
      { cache: 'bypass' },
    );
    const existingMuteEvent = newestEvent(muteQuery.events);
    if (!existingMuteEvent && !muteQuery.complete) {
      throw new CodedError('mute-list-load-failed', 'Could not load your mute list. Try again.');
    }
    const existingTags = existingMuteEvent?.tags ?? [];
    const existingContent = existingMuteEvent?.content ?? '';

    const otherTags = existingTags.filter((t) => !(t[0] === 'p' && t[1] === pubkey));
    const nextTags = muted ? [...otherTags, ['p', pubkey]] : otherTags;

    // Optimistic update so mute/unmute UI reflects immediately; the relay
    // echo will overwrite this with the canonical list via
    // subscribeMuteList. This is intentionally non-destructive: existing
    // messages/DMs/metadata stay in the local stores.
    const current = this.myMutes.get();
    const optimistic = muted
      ? current.includes(pubkey) ? current : [...current, pubkey]
      : current.filter((p) => p !== pubkey);
    this.myMutes.set(optimistic);

    await this.ctx.signAndPublish(
      {
        kind: KIND_MUTE_LIST,
        content: existingContent,
        tags: nextTags,
        created_at: Math.floor(Date.now() / 1000),
      },
      PROFILE_RELAYS,
    );
  }

  seedContactListCache(pubkey: string): void {
    const cached = cacheGet<NostrEvent>(PROFILE_RELAYS[0], KIND_CONTACT_LIST, pubkey)?.value;
    if (!cached || cached.kind !== KIND_CONTACT_LIST || cached.pubkey !== pubkey) return;
    this.ingestContactList(cached);
  }

  ingestContactList(ev: NostrEvent): void {
    const session = this.ctx.session();
    if (!session || ev.kind !== KIND_CONTACT_LIST || ev.pubkey !== session.pubKeyHex) return;
    if (ev.created_at <= this.myContactListLatestAt) return;
    this.myContactListLatestAt = ev.created_at;
    this.myContactList.set(ev);
    this.myContactListReady.set(true);
    cacheSet(PROFILE_RELAYS[0], KIND_CONTACT_LIST, ev.pubkey, ev);
  }

  subscribeContactList(): void {
    const session = this.ctx.session();
    if (!session) return;
    const relays = Array.from(new Set([
      ...this.ctx.relays(),
      ...PROFILE_RELAYS,
      ...getPreferences().socialRelays,
    ]));
    const sub = this.ctx.subscribeWatched(
      relays,
      { kinds: [KIND_CONTACT_LIST], authors: [session.pubKeyHex], limit: 1 },
      (ev) => this.ingestContactList(ev),
      () => this.myContactListReady.set(true),
      { affectsRelayAccess: false, bypassWot: true },
    );
    this.ctx.track(sub);
  }

  subscribeMuteList(): void {
    const session = this.ctx.session();
    if (!session) return;
    const filter: Filter = { kinds: [KIND_MUTE_LIST], authors: [session.pubKeyHex], limit: 1 };
    // Like kind 3, mute lists may live on profile/outbox relays. Do not keep
    // persistent external subscriptions open during normal server browsing.
    let latestCreatedAt = 0;
    const sub = this.ctx.subscribeWatched(this.ctx.relays(), filter, (ev) => {
      if (ev.created_at <= latestCreatedAt) return;
      latestCreatedAt = ev.created_at;
      this.myMutes.set(getAllTags(ev, 'p'));
    });
    this.ctx.track(sub);
  }

  /** Account change or logout: forget the contact list. */
  resetContactList(): void {
    this.myContactList.set(null);
    this.myContactListReady.set(false);
    this.myContactListLatestAt = 0;
  }

  /**
   * Logout: forget the mute list. It is the account's own (kind 10000) and
   * feeds the WoT engine, so keeping it let the next account on this browser
   * hide the people the previous one muted, until (and unless) its own list
   * arrived. `logout-is-fresh.test.ts` caught it.
   */
  resetMuteList(): void {
    this.myMutes.set([]);
  }
}
