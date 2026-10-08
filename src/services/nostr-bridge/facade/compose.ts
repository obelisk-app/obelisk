/**
 * The bridge's wiring (round 4 plan, §2): every module, built once in
 * dependency order and handed the narrow callbacks it needs into the
 * others. Moved from `BridgeImpl`'s constructor, so the facade only
 * delegates. The order of construction, and of the side effects at the end
 * (the WoT wiring, the AUTH-settled hook, the watch's subscriptions), is
 * the constructor's; the closures read the other modules at call time.
 */
import type { RelayHub } from '@nostr-wot/relay/hub';
import { KIND_CONTACT_LIST, KIND_EMOJI_FAVORITES, KIND_EMOJI_SET } from '@/constants/nostr/nip-kinds';
import type { NostrSigner as DmNostrSigner } from '@nostr-wot/signers';
import { subscribePreferences } from '@/services/preferences/preferences';
import type { BridgeContext } from './context';
import { DmModules } from './compose-dm';
import { GroupMetadataModule } from '../groups/metadata/metadata';
import { MembershipModule } from '../groups/membership/membership';
import { MessagesModule } from '../groups/message/module';
import { MessagesState } from '../groups/message/state';
import { ModerationModule } from '../groups/message/moderation';
import { ReactionsModule } from '../groups/message/reactions';
import { ListsModule } from '../lists/lists';
import { MediaPacksModule } from '../lists/media-packs';
import { PingsModule } from '../groups/message/pings';
import { ProfilesModule } from '../profile/profiles';
import { PublishModule } from '../publish/publish';
import { AuthRepublisher } from '../publish/publish-auth';
import { RelayAccessModule } from '../relay/relay-access';
import { seedCacheForRelay } from '../cache/seed';
import { BrowserConnectionEvents } from '../session/browser-events';
import { BunkerModule } from '../session/bunker';
import { BunkerLogin } from '../session/bunker-login';
import { ConnectionModule } from '../session/connection';
import { buildDmSigner } from '../session/dm-signer';
import { openSessionSubscriptions, type FanoutTargets } from '../session/fanout';
import type { LifecycleTargets } from '../session/lifecycle';
import { LoginModule } from '../session/login';
import { RelayRail } from '../session/relays';
import { SessionSigner } from '../session/signer';
import { SessionState } from '../session/state';
import { installSignerQueueDebug, type SignerLane } from '../session/signer-queue';
import { StateStore } from '../common/state-store';
import { RequestsModule } from '../subscriptions/registry';
import type { JsDirectMessage } from '../common/types';
import { VoicePresenceModule } from '../voice/voice-presence';

/** What only the facade can provide: its test-visible decrypt seam and its teardown. */
export interface FacadeSeams {
  decryptNip04(senderPubkey: string, ciphertext: string, lane: SignerLane): Promise<string>;
  dispose(): void;
}

export class BridgeModules {
  /** The seam the modules see of the bridge (round 4 plan, §2). */
  readonly ctx: BridgeContext;
  /** Who is logged in, the relay being browsed, and the stores the login gate observes. */
  readonly state = new SessionState();
  readonly messageState = new MessagesState();
  readonly dmsByPeer = new StateStore<Record<string, JsDirectMessage[]>>({});
  readonly unsubscribeHubStatus: () => void;
  readonly connection: ConnectionModule;
  readonly authRepublish: AuthRepublisher;
  readonly reqs: RequestsModule;
  readonly bunker: BunkerModule;
  readonly signer: SessionSigner;
  readonly profiles: ProfilesModule;
  readonly dm: DmModules;
  readonly access: RelayAccessModule;
  readonly lists: ListsModule;
  readonly membership: MembershipModule;
  readonly metadata: GroupMetadataModule;
  readonly moderation: ModerationModule;
  readonly reactions: ReactionsModule;
  readonly voicePresence: VoicePresenceModule;
  readonly pings: PingsModule;
  readonly media: MediaPacksModule;
  readonly messages: MessagesModule;
  readonly publisher: PublishModule;
  readonly browserEvents: BrowserConnectionEvents;
  readonly lifecycle: LifecycleTargets;
  readonly rail: RelayRail;
  readonly login: LoginModule;
  readonly bunkerLogin: BunkerLogin;

  constructor(
    readonly hub: RelayHub,
    readonly seams: FacadeSeams,
  ) {
    // The groups store lives in the metadata module, which is constructed
    // from this very context a few lines below; the context's accessor
    // resolves it once it exists (an arrow keeps this object's `this`).
    const groupsStore = () => this.metadata.groups;
    this.connection = new ConnectionModule(this.state, {
      hub: this.hub,
      setRelayAccess: (url, state) => this.access.set(url, state),
      resetAccess: () => this.access.reset(),
      openSessionSubscriptions: (perGroup) => openSessionSubscriptions(this.fanoutTargets(), perGroup),
    });
    this.unsubscribeHubStatus = this.hub.onStatus((status) => this.connection.onHubStatus(status));
    this.authRepublish = new AuthRepublisher(this.hub);
    this.ctx = {
      session: () => this.state.session,
      relays: () => this.state.relays,
      currentRelayUrl: this.state.currentRelayUrl,
      relayAccess: this.state.relayAccess,
      configuredRelays: this.state.configuredRelays,
      myPubkey: this.state.myPubkey,
      dmsByPeer: this.dmsByPeer,
      isLoggedIn: this.state.isLoggedIn,
      get groups() { return groupsStore(); },
      messagesByGroup: this.messageState.messagesByGroup,
      subscribeWatched: (relays, filter, onevent, oneose, options) => this.reqs.subscribeWatched(relays, filter, onevent, oneose, options),
      track: (...subs) => this.reqs.track(...subs),
      closeTracked: (sub) => this.reqs.closeTracked(sub),
      untrack: (sub) => this.reqs.untrack(sub),
      queryRelaysWithConfidence: (relays, filter, maxWait, opts) => this.reqs.queryRelaysWithConfidence(relays, filter, maxWait, opts),
      queryAuthorsWithConfidence: (relays, filters, maxWait, opts) => this.reqs.queryAuthorsWithConfidence(relays, filters, maxWait, opts),
      signAndPublish: (template, relayOpts, opts) => this.publisher.signAndPublish(template, relayOpts, opts),
      publishEvent: (template, opts) => this.publisher.publishEvent(template, opts),
      setRelayAccess: (url, state, opts) => this.access.set(url, state, opts),
      setRelayAccessDeferred: (url, state) => this.access.setDeferred(url, state),
    };
    this.reqs = new RequestsModule({
      hub: this.hub,
      relays: () => this.state.relays,
      watched: {
        hub: this.hub,
        signerOffered: () => this.state.session !== null,
        setRelayAccess: (url, state, opts) => this.access.set(url, state, opts),
        setRelayAccessDeferred: (url, state) => this.access.setDeferred(url, state),
      },
      connectionState: this.state.connectionState,
      activeSocketUp: () => this.connection.activeSocketUp(),
    });
    this.bunker = new BunkerModule(this.ctx);
    this.signer = new SessionSigner(this.ctx, this.bunker);
    this.profiles = new ProfilesModule(this.ctx, {
      publishSignedEventToRelays: (ev, relays) => this.publisher.publishSignedEventToRelays(ev, relays),
    });
    this.dm = new DmModules(this);
    this.access = new RelayAccessModule(this.ctx, {
      isDmLeasedRelay: (url) => this.dm.dmInbox.hasLease(url),
      onAuthOk: () => this.messages.stream.restartStuck(),
      onAccessFail: () => this.messages.stream.stopRetries(),
      ingestOwnMetadata: (ev) => this.profiles.ingest(ev),
    });
    this.lists = new ListsModule(this.ctx);
    this.membership = new MembershipModule(this.ctx, {
      isActiveGroup: (groupId) => groupId === this.messageState.activeGroupId,
      ensureUserMetadata: (pubkey) => this.profiles.ensure(pubkey),
    });
    this.metadata = new GroupMetadataModule(this.ctx, {
      recordCreator: (groupId, pubkey) => this.membership.recordCreator(groupId, pubkey),
      onGroupDiscovered: (groupId) => this.messages.queue.queue(groupId),
    });
    this.moderation = new ModerationModule(this.ctx, {
      removeMessages: (groupId, ids, author) => this.messages.removeDeleted(groupId, ids, author),
      removeReactions: (groupId, ids, author, deletedTargets, messagesChanged) =>
        this.reactions.removeDeleted(groupId, ids, author, deletedTargets, messagesChanged),
    });
    this.reactions = new ReactionsModule(this.ctx, {
      isModerated: (groupId, eventId) => this.moderation.isModerated(groupId, eventId),
      isDeletedByAuthor: (groupId, eventId, pubkey) => this.moderation.isDeletedByAuthor(groupId, eventId, pubkey),
      ingestEventDeletion: (groupId, ev) => this.moderation.ingestEventDeletion(groupId, ev),
      ensureEventDeletions: (groupId) => this.moderation.ensureEventDeletions(groupId),
    });
    this.voicePresence = new VoicePresenceModule(this.ctx);
    this.pings = new PingsModule(this.ctx, {
      subscribeWatch: (relay, filter, cb) => this.reqs.subscribeWatch(relay, filter, cb),
      acquireWatchLease: (relay) => this.hub.acquireAuthLease(relay, 'watch'),
      hasOwnMessageStream: (groupId) => this.messageState.subscribedGroups.has(groupId),
      isMuted: (pubkey) => this.lists.isMuted(pubkey),
      ensureUserMetadata: (pubkey) => this.profiles.ensure(pubkey),
      displayNameFor: (pubkey) => this.profiles.displayNameFor(pubkey),
    });
    this.media = new MediaPacksModule(this.ctx);
    this.messages = new MessagesModule(this.messageState, this.ctx, {
      waitForRelayAuth: (timeoutMs) => this.access.waitForAuth(timeoutMs),
      moderation: this.moderation,
      pings: this.pings,
      ensureUserMetadata: (pubkey) => this.profiles.ensure(pubkey),
    });
    this.publisher = new PublishModule(this.ctx, {
      hub: this.hub,
      getAuthSigner: () => this.signer.getAuthSigner(),
      withBunkerSigner: (operation, opts) => this.bunker.run(operation, opts),
      authAndRepublish: (url, event) => this.authRepublish.run(url, event),
      onSigned: (event) => this.voicePresence.ingestMeshVoicePresence(event),
      onPublished: (event) => {
        if (event.kind === KIND_CONTACT_LIST) this.lists.ingestContactList(event);
        if (event.kind === KIND_EMOJI_SET) this.media.ingestMediaPack(event);
        if (event.kind === KIND_EMOJI_FAVORITES) this.media.ingestMediaFavorites(event);
      },
    });
    this.lists.wireWotEngine();
    this.access.wireAuthSettledHook();
    subscribePreferences(() => this.pings.syncBackgroundWatch());
    // Every way of becoming logged in, fresh login, page-reload restore,
    // background reconnect, flips this store; hanging the watch off it
    // means no path can forget to start it (the reload path did).
    this.state.isLoggedIn.subscribe((loggedIn) => {
      if (loggedIn) this.pings.recordRelayUse(this.state.currentRelayUrl.get());
      this.pings.syncBackgroundWatch();
    });
    this.browserEvents = new BrowserConnectionEvents(this.state, () => this.connection.retryConnectionNow());
    this.lifecycle = {
      state: this.state,
      hub: this.hub,
      reqs: this.reqs,
      connection: this.connection,
      browserEvents: this.browserEvents,
      bunker: this.bunker,
      dmInbox: this.dm.dmInbox,
      dmSend: this.dm.dmSend,
      dmsByPeer: this.dmsByPeer,
      dmRelays: this.dm.dmRelays,
      dmStore: this.dm.dmStore,
      messages: this.messages.lifecycle(),
      reactions: this.reactions,
      moderation: this.moderation,
      membership: this.membership,
      profiles: this.profiles,
      media: this.media,
      metadata: this.metadata,
      voicePresence: this.voicePresence,
      access: this.access,
      pings: this.pings,
      lists: this.lists,
      seedCacheForRelay: (relay) => this.seedCacheForRelay(relay),
      signSessionAuth: (evt) => this.signer.signSessionAuth(evt),
    };
    this.rail = new RelayRail(this.lifecycle, {
      connect: (perGroup) => this.connection.connect(perGroup),
      persist: () => this.login.persist(),
    });
    this.login = new LoginModule(this.lifecycle, {
      connect: (perGroup) => this.connection.connect(perGroup),
      restoreConfiguredRelays: () => this.rail.restore(),
      ensureRelayInList: (url) => this.rail.ensureRelayInList(url),
      dispose: () => this.seams.dispose(),
    });
    this.bunkerLogin = new BunkerLogin(this.state, this.bunker, () => this.login.finalizeLogin(), () => this.login.logout());
    // `window.__obeliskSignerQueue.stats()`, mirrors `window.wot`.
    installSignerQueueDebug();
  }

  /** The DM transport signer; only the gift-wrap ingest passes `pqTrack` and the background lane. */
  dmSigner(pqTrack?: { current: boolean }, lane: SignerLane = 'interactive'): DmNostrSigner | null {
    return buildDmSigner(this.state.session, {
      bunker: this.bunker,
      encryptNip04: (recipient, plaintext, l) => this.dm.nip04.encrypt(recipient, plaintext, l),
      decryptNip04: (sender, ciphertext, l) => this.seams.decryptNip04(sender, ciphertext, l),
    }, pqTrack, lane);
  }

  /** The cold paint of every module for `relay` (`./seed.ts`). */
  seedCacheForRelay(relay: string): boolean {
    return seedCacheForRelay(relay, {
      metadata: this.metadata,
      membership: this.membership,
      profiles: this.profiles,
      media: this.media,
      messages: this.messages,
      reactions: this.reactions,
    });
  }

  /** What the session fan-out opens, module by module (`session/fanout.ts`). */
  fanoutTargets(): FanoutTargets {
    return {
      myPubkey: () => this.state.session?.pubKeyHex ?? null,
      access: this.access,
      metadata: this.metadata,
      membership: this.membership,
      lists: this.lists,
      media: this.media,
      voicePresence: this.voicePresence,
      pings: this.pings,
      reactions: this.reactions,
      ensureUserMetadata: (pubkey) => this.profiles.ensure(pubkey),
      activeGroupId: () => this.messageState.activeGroupId,
      subscribeGroupMessages: (groupId) => this.messages.stream.subscribe(groupId),
      dmInbox: this.dm.dmInbox,
    };
  }
}
