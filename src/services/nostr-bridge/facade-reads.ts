/**
 * The read half of the bridge facade: every store as a property and every
 * `subscribeX`, which replays the current value and then reports each
 * change. `BridgeImpl` (`client.ts`) extends this and adds the commands and
 * the lifecycle; both halves delegate into the modules `compose.ts` builds.
 * A subscribe that needs a REQ (a channel's messages, its reactions, its
 * members, DMs, the media library) opens it here, idempotently.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { getPreferences } from '@/services/preferences';
import type { IncomingDmCallMessage } from '@/services/dm-call/protocol';
import type { BridgeModules } from './compose';
import type { LoginMethod } from './session/state';
import type { SessionNotice } from './session/vault';
import type { Listener, StateStore } from './state-store';
import type {
  JsDirectMessage,
  JsGroup,
  JsMediaFavorites,
  JsMediaPack,
  JsMessage,
  JsReaction,
  JsUserMetadata,
  MessagesStatus,
  RelayAccessState,
  Unsubscribe,
} from './types';
import type { ActiveCallInfo } from './voice-presence';

export abstract class BridgeReads {
  protected abstract readonly m: BridgeModules;

  // ---- stores, reachable as properties for the hooks, shells and tests ----

  get relayAccess(): StateStore<Record<string, RelayAccessState>> { return this.m.state.relayAccess; }
  get connectionState(): StateStore<string> { return this.m.state.connectionState; }
  get currentRelayUrl(): StateStore<string> { return this.m.state.currentRelayUrl; }
  get configuredRelays(): StateStore<string[]> { return this.m.state.configuredRelays; }
  get isLoggedIn(): StateStore<boolean> { return this.m.state.isLoggedIn; }
  get myPubkey(): StateStore<string | null> { return this.m.state.myPubkey; }
  get myLoginMethod(): StateStore<LoginMethod | null> { return this.m.state.myLoginMethod; }
  get bunkerSignerReady(): StateStore<boolean> { return this.m.bunker.ready; }
  get sessionNotice(): StateStore<SessionNotice | null> { return this.m.state.sessionNotice; }
  get groups(): StateStore<JsGroup[]> { return this.m.metadata.groups; }
  get groupMetadataEose(): StateStore<boolean> { return this.m.metadata.groupMetadataEose; }
  get childrenByParent(): StateStore<Record<string, string[]>> { return this.m.metadata.childrenByParent; }
  get adminsByGroup(): StateStore<Record<string, string[]>> { return this.m.membership.adminsByGroup; }
  get membersByGroup(): StateStore<Record<string, string[]>> { return this.m.membership.membersByGroup; }
  get membershipReadyByGroup(): StateStore<Record<string, boolean>> { return this.m.membership.membershipReadyByGroup; }
  get groupCreators(): StateStore<Record<string, string>> { return this.m.membership.groupCreators; }
  get messagesByGroup(): StateStore<Record<string, JsMessage[]>> { return this.m.messageState.messagesByGroup; }
  get messagesStatusByGroup(): StateStore<Record<string, MessagesStatus>> { return this.m.messageState.messagesStatusByGroup; }
  get reactionsByGroup(): StateStore<Record<string, Record<string, JsReaction[]>>> { return this.m.reactions.reactionsByGroup; }
  get myMutes(): StateStore<string[]> { return this.m.lists.myMutes; }
  get dmsByPeer(): StateStore<Record<string, JsDirectMessage[]>> { return this.m.dmsByPeer; }
  get userMetadata(): StateStore<Record<string, JsUserMetadata>> { return this.m.profiles.userMetadata; }
  get myContactList(): StateStore<NostrEvent | null> { return this.m.lists.myContactList; }
  get myContactListReady(): StateStore<boolean> { return this.m.lists.myContactListReady; }
  get mediaPacks(): StateStore<Record<string, JsMediaPack>> { return this.m.media.mediaPacks; }
  get myMediaFavorites(): StateStore<JsMediaFavorites> { return this.m.media.myMediaFavorites; }
  get activeCallByChannel(): StateStore<Record<string, ActiveCallInfo>> { return this.m.voicePresence.activeCallByChannel; }

  // ---- subscriptions: replay the current value, then every change ----------

  subscribeConfiguredRelays(cb: (urls: ReadonlyArray<string>) => void): Unsubscribe {
    return this.configuredRelays.subscribe(cb);
  }

  subscribeIsLoggedIn(cb: (v: boolean) => void): Unsubscribe {
    return this.isLoggedIn.subscribe(cb);
  }

  subscribeRelayAccess(cb: (byRelay: Readonly<Record<string, RelayAccessState>>) => void): Unsubscribe {
    return this.relayAccess.subscribe(cb);
  }

  subscribeConnectionState(cb: (label: string) => void): Unsubscribe {
    return this.connectionState.subscribe(cb);
  }

  subscribeCurrentRelayUrl(cb: (url: string) => void): Unsubscribe {
    return this.currentRelayUrl.subscribe(cb);
  }

  subscribeMyPubkey(cb: (pubkey: string | null) => void): Unsubscribe {
    return this.myPubkey.subscribe(cb);
  }

  subscribeMyLoginMethod(cb: (m: 'nsec' | 'nip07' | 'bunker' | null) => void): Unsubscribe {
    return this.myLoginMethod.subscribe(cb);
  }

  subscribeBunkerSignerReady(cb: (ready: boolean) => void): Unsubscribe {
    return this.bunkerSignerReady.subscribe(cb);
  }

  subscribeSessionNotice(cb: (notice: SessionNotice | null) => void): Unsubscribe {
    return this.sessionNotice.subscribe(cb);
  }

  subscribeGroups(cb: (groups: ReadonlyArray<JsGroup>) => void): Unsubscribe {
    return this.groups.subscribe(cb);
  }

  subscribeGroupMetadataEose(cb: (eose: boolean) => void): Unsubscribe {
    return this.groupMetadataEose.subscribe(cb);
  }

  subscribeMessages(groupId: string, cb: (msgs: ReadonlyArray<JsMessage>) => void): Unsubscribe {
    // Belt-and-braces: messages start streaming as soon as group metadata
    // arrives (see ingestGroupMetadata). This call is idempotent and only
    // matters for groups the user opens via deep link before metadata lands.
    this.m.messages.stream.subscribe(groupId);
    const adapter: Listener<Record<string, JsMessage[]>> = (byGroup) => cb(byGroup[groupId] ?? []);
    return this.messagesByGroup.subscribe(adapter);
  }

  subscribeMessagesByGroup(
    cb: (byGroup: Readonly<Record<string, ReadonlyArray<JsMessage>>>) => void,
  ): Unsubscribe {
    return this.messagesByGroup.subscribe(cb);
  }

  /**
   * Per-group confidence enum for the kind 9 messages stream. The chat
   * pane reads this to decide between "Loading messages…" and
   * "No messages yet". See {@link MessagesStatus} for transitions.
   * Subscribing also fast-tracks the underlying REQ, matching
   * {@link subscribeMessagesEose}'s behavior.
   */
  subscribeMessagesStatus(
    groupId: string,
    cb: (status: MessagesStatus) => void,
  ): Unsubscribe {
    this.m.messages.stream.subscribe(groupId);
    const adapter: Listener<Record<string, MessagesStatus>> = (m) => cb(m[groupId] ?? 'loading');
    return this.messagesStatusByGroup.subscribe(adapter);
  }

  subscribeUserMetadata(pubkey: string, cb: (meta: JsUserMetadata | null) => void): Unsubscribe {
    this.m.profiles.ensure(pubkey);
    const adapter: Listener<Record<string, JsUserMetadata>> = (m) => cb(m[pubkey] ?? null);
    return this.userMetadata.subscribe(adapter);
  }

  subscribeUserMetadataMap(cb: (meta: Readonly<Record<string, JsUserMetadata>>) => void): Unsubscribe {
    return this.userMetadata.subscribe(cb);
  }

  subscribeReactions(
    groupId: string,
    cb: (byTarget: Readonly<Record<string, ReadonlyArray<JsReaction>>>) => void,
  ): Unsubscribe {
    this.m.reactions.ensurePerGroup(groupId);
    const adapter: Listener<Record<string, Record<string, JsReaction[]>>> = (all) =>
      cb(all[groupId] ?? {});
    return this.reactionsByGroup.subscribe(adapter);
  }

  subscribeChildrenByParent(
    cb: (byParent: Readonly<Record<string, ReadonlyArray<string>>>) => void,
  ): Unsubscribe {
    return this.childrenByParent.subscribe(cb);
  }

  subscribeDirectMessages(
    cb: (byPeer: Readonly<Record<string, ReadonlyArray<JsDirectMessage>>>) => void,
  ): Unsubscribe {
    if (!getPreferences().directMessagesEnabled) {
      cb({});
      return () => {};
    }
    this.m.dm.dmInbox.wanted = true;
    if (!this.m.dm.dmInbox.subscribed) this.m.dm.dmInbox.subscribe();
    return this.dmsByPeer.subscribe(cb);
  }

  subscribeMyContactList(cb: (event: NostrEvent | null) => void): Unsubscribe {
    return this.myContactList.subscribe(cb);
  }

  subscribeMyContactListReady(cb: (ready: boolean) => void): Unsubscribe {
    return this.myContactListReady.subscribe(cb);
  }

  subscribeMediaPacks(
    cb: (packs: Readonly<Record<string, JsMediaPack>>) => void,
  ): Unsubscribe {
    this.m.media.subscribe();
    return this.mediaPacks.subscribe(cb);
  }

  subscribeMyMediaFavorites(cb: (favorites: JsMediaFavorites) => void): Unsubscribe {
    this.m.media.subscribe();
    return this.myMediaFavorites.subscribe(cb);
  }

  subscribeMyMutes(cb: (pubkeys: ReadonlyArray<string>) => void): Unsubscribe {
    return this.myMutes.subscribe(cb);
  }

  subscribeAdmins(groupId: string, cb: (admins: ReadonlyArray<string>) => void): Unsubscribe {
    this.m.membership.ensurePerGroup(groupId);
    const adapter: Listener<Record<string, string[]>> = (byGroup) => cb(byGroup[groupId] ?? []);
    return this.adminsByGroup.subscribe(adapter);
  }

  subscribeAdminsByGroup(
    cb: (byGroup: Readonly<Record<string, ReadonlyArray<string>>>) => void,
  ): Unsubscribe {
    return this.adminsByGroup.subscribe(cb);
  }

  subscribeMembers(groupId: string, cb: (members: ReadonlyArray<string>) => void): Unsubscribe {
    this.m.membership.ensurePerGroup(groupId);
    const adapter: Listener<Record<string, string[]>> = (byGroup) => cb(byGroup[groupId] ?? []);
    return this.membersByGroup.subscribe(adapter);
  }

  subscribeMembersByGroup(
    cb: (byGroup: Readonly<Record<string, ReadonlyArray<string>>>) => void,
  ): Unsubscribe {
    return this.membersByGroup.subscribe(cb);
  }

  /**
   * Subscribe to the "relay has delivered at least one 39001/39002 for this
   * group" signal. Fires `false` immediately on subscribe (or `true` if a
   * membership event was already observed), then `true` when the first event
   * lands. Callers should also call {@link subscribeMembers} /
   * {@link subscribeAdmins} so the underlying REQ is open.
   */
  subscribeMembershipReady(groupId: string, cb: (ready: boolean) => void): Unsubscribe {
    this.m.membership.ensurePerGroup(groupId);
    const adapter: Listener<Record<string, boolean>> = (m) => cb(!!m[groupId]);
    return this.membershipReadyByGroup.subscribe(adapter);
  }

  /** Reactive subscription over the kind 9007 creator map (groupId -> pubkey). */
  subscribeGroupCreators(cb: (byGroup: Readonly<Record<string, string>>) => void): Unsubscribe {
    return this.groupCreators.subscribe(cb);
  }

  /** Subscribe to the active-call state for any channel. */
  subscribeActiveCallByChannel(
    cb: (byChannel: Readonly<Record<string, { hostPubkey: string; status: string; participantCount: number; expiresAt: number; createdAt: number; mode?: 'sfu' | 'mesh'; participantPubkeys?: string[] }>>) => void,
  ): Unsubscribe {
    return this.activeCallByChannel.subscribe(cb);
  }

  subscribeDmCallMessages(cb: (msg: IncomingDmCallMessage & { peer: string }) => void): Unsubscribe {
    return this.m.dm.dmCalls.subscribe(cb);
  }
}
