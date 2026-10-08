/**
 * What the session lifecycle (login, logout, relay switch, teardown) reaches
 * in the other modules: one typed view the facade builds once, so the reset
 * sequences in `./reset.ts` and the login and relay-rail modules name every
 * module they touch and every method they call on it.
 */
import type { EventTemplate, VerifiedEvent } from 'nostr-tools';
import type { RelayHub } from '@nostr-wot/relay/hub';
import type { DmInboxModule } from '../dm/inbox';
import type { DmRelaysModule } from '../dm/relays';
import type { DmSendModule } from '../dm/send';
import type { DmStoreModule } from '../dm/store';
import type { GroupMetadataModule } from '../groups/metadata/metadata';
import type { MembershipModule } from '../groups/membership/membership';
import type { ModerationModule } from '../groups/message/moderation';
import type { ReactionsModule } from '../groups/message/reactions';
import type { ListsModule } from '../lists/lists';
import type { MediaPacksModule } from '../lists/media-packs';
import type { PingsModule } from '../groups/message/pings';
import type { ProfilesModule } from '../profile/profiles';
import type { RelayAccessModule } from '../relay/relay-access';
import type { StateStore } from '../common/state-store';
import type { PinnedRequests } from '../subscriptions/pinned';
import type { RequestsModule } from '../subscriptions/registry';
import type { JsDirectMessage } from '../common/types';
import type { VoicePresenceModule } from '../voice/voice-presence';
import type { BrowserConnectionEvents } from './browser-events';
import type { BunkerModule } from './bunker';
import type { ConnectionModule } from './connection';
import type { SessionState } from './state';

/**
 * The group-message state's share of every reset, one method per line the
 * facade used to run inline, so the sequences keep their exact order.
 */
export interface MessagesLifecycle {
  /** The channels with a live kind 9 REQ, which a session reset reopens. */
  subscribedGroups(): string[];
  activeGroupId(): string | null;
  forgetSubscriptions(): void;
  clearStore(): void;
  clearPendingSends(): void;
  resetStatus(): void;
  clearAllRetry(): void;
  clearQueue(): void;
  clearTimers(): void;
  clearFlushers(): void;
  clearQuerySyncFallback(): void;
  clearActiveGroup(): void;
}

export interface LifecycleTargets {
  readonly state: SessionState;
  readonly hub: Pick<RelayHub, 'setIdentity' | 'disconnect'>;
  readonly reqs: Pick<RequestsModule, 'closeAll'> & { readonly pinned: Pick<PinnedRequests, 'releaseAll'> };
  readonly connection: ConnectionModule;
  readonly browserEvents: Pick<BrowserConnectionEvents, 'wire' | 'unwire'>;
  readonly bunker: Pick<BunkerModule, 'ensure' | 'ready' | 'close'>;
  readonly dmInbox: Pick<DmInboxModule, 'dropHandles' | 'forgetSubscriptions' | 'releaseLeases'>;
  readonly dmSend: Pick<DmSendModule, 'clearPending'>;
  readonly dmsByPeer: StateStore<Record<string, JsDirectMessage[]>>;
  readonly dmRelays: Pick<DmRelaysModule, 'ensureInboxPublished'>;
  /** The encrypted DM store: pointed at the account on login and reload, deleted on logout. */
  readonly dmStore: Pick<DmStoreModule, 'attach' | 'destroy'>;
  readonly messages: MessagesLifecycle;
  readonly reactions: Pick<ReactionsModule, 'subscribed' | 'forgetSubscriptions' | 'clearFlushers' | 'clear' | 'hasPerGroup'>;
  readonly moderation: Pick<ModerationModule, 'forgetSubscriptions' | 'reset'>;
  readonly membership: Pick<
    MembershipModule,
    'perGroupSubscribed' | 'forgetSubscriptions' | 'resetReadiness' | 'resetLists' | 'resetCreators' | 'hasPerGroup'
  >;
  readonly profiles: Pick<ProfilesModule, 'requestedPubkeys' | 'forgetRequested' | 'clearPendingQueue' | 'syncOwn' | 'dispose'>;
  readonly media: Pick<MediaPacksModule, 'markUnsubscribed' | 'reset'>;
  readonly metadata: Pick<GroupMetadataModule, 'forgetRevisions' | 'resetEose' | 'clearGroups' | 'resetChildren'>;
  readonly voicePresence: Pick<VoicePresenceModule, 'reset'>;
  readonly access: Pick<RelayAccessModule, 'reset'>;
  readonly pings: Pick<PingsModule, 'stop' | 'recordRelayUse' | 'syncBackgroundWatch'>;
  readonly lists: Pick<ListsModule, 'resetContactList' | 'resetMuteList' | 'seedContactListCache'>;
  /** The cold paint (`../seed.ts`). */
  seedCacheForRelay(relay: string): boolean;
  /** The facade's NIP-42 signer seam (`SessionSigner.signSessionAuth`). */
  signSessionAuth(evt: EventTemplate): Promise<VerifiedEvent>;
}
