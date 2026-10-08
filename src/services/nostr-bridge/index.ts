export { getBridge, getBridgeImpl, logoutPageSession, type BridgeImpl } from './facade/client';
export { isImportableRelayUrl } from './relay/relay-list';
// The page's relay hub, for a service that rides it under its own identity (a wallet connection).
export { pageRelayHub } from './facade/page-hub';
export { DEFAULT_PROFILE_LOOKUP_RELAYS } from '@/constants/nostr-bridge/profile';
export { cacheGet, cacheSet, cacheDelete } from './cache/cache';
export { resubscribeOnQuotaClose } from './relay/quota-resubscribe';
export { hasSeenWrap, markWrapSeen, type WrapLedgerScope } from './cache/wrap-ledger';
export { nostrActions } from './facade/actions';
// The React provider and the two hooks that hand out the instance itself.
export { BridgeProvider, type BridgeProviderProps } from './hooks/bridge-provider';
export { useAwaitBridge, useBridge, useBridgeReady } from './hooks/provider';
// The React hooks, one file per concern under `./hooks/`.
export { useConnectionState, useCurrentRelayUrl, useRelayAccess, useConfiguredRelays } from './hooks/connection';
export type { SessionNotice } from './session/vault';
// What the bridge's errors and activity entries carry. Types only: the
// runtime helpers (`CodedError`, `errorText`) live in `@/utils/errors/`, so a
// test that fakes this module still gets the real ones.
export type { ActivityCode, ErrorCode, EventKindLabel } from '@/utils/errors/codes';
export {
  useMyContactList,
  useMyContactListReady,
  useMediaPacks,
  useMyMediaFavorites,
  useMyFollows,
  useMyFollowSet,
  useMyMutes,
} from './hooks/lists';
export {
  useGroups,
  useGroupById,
  useGroupMetadataEose,
  useChildrenByParent,
  useGroupCreators,
  useGroupCreator,
} from './hooks/groups';
export {
  useMessages,
  useMessagesByGroup,
  useLoadEarlier,
  useMessagesStatus,
  useUserMetadata,
  useReactions,
  useDirectMessages,
  useDmLock,
} from './hooks/messages';
export {
  useMembershipReady,
  useAdmins,
  useAdminsByGroup,
  useMembers,
  useMembersByGroup,
  useRelayPeople,
  useGroupMemberInfo,
} from './hooks/members';
export type { JsMemberInfo } from './hooks/members';
export { useActiveCallByChannel, useActiveCall } from './hooks/calls';
export type { ActiveCallInfo } from './hooks/calls';
export type {
  JsGroup,
  JsForumTag,
  JsMessage,
  JsSearchHit,
  JsSearchOptions,
  JsSearchResponse,
  JsUserMetadata,
  JsReaction,
  JsDirectMessage,
  DmRawEvent,
  DmLockState,
  DmLockStatus,
  JsMediaFavorites,
  JsMediaItem,
  JsMediaKind,
  JsMediaPack,
  MessagesStatus,
  RelayAccessState,
  Unsubscribe,
} from './common/types';

export type { LoginMethod } from './session/state';
