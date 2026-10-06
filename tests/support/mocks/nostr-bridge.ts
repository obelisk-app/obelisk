/**
 * The one type-checked `@/services/nostr-bridge` mock.
 *
 * Every hook returns what the real hook's signature says it returns, so a
 * mock that production could never produce is a `tsc` error instead of a
 * green test (round 2 found six suites returning `{ status: 'ok' }` from a
 * hook typed as a string union). The pins are `satisfies` clauses against
 * `typeof import('@/services/nostr-bridge')`: a hook added to or re-shaped in the
 * real module fails the typecheck here, not silently in sixty inline copies.
 *
 * Usage, inside a hoisted `vi.mock` factory (the import has to be dynamic
 * because `vi.mock` is hoisted above every static import):
 *
 *   vi.mock('@/services/nostr-bridge', async () => {
 *     const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
 *     return bridgeMock({ useMyPubkey: () => ME, useGroups: () => groups });
 *   });
 *
 * Overrides are closures evaluated per render, so a test that mutates a
 * `let` or a `vi.hoisted` object between renders keeps working as before.
 *
 * Defaults return stable references (`EMPTY_LIST`, `EMPTY_RECORD`), like the
 * real stores do; a hook that handed out a fresh `[]` every render would
 * re-fire any effect keyed on it.
 */
import { createElement, Fragment } from 'react';
import type {
  BridgeImpl,
  JsDirectMessage,
  JsGroup,
  JsMemberInfo,
  JsMessage,
  JsUserMetadata,
} from '@/services/nostr-bridge';
import { isImportableRelayUrl } from '@/services/nostr-bridge/relay-list';
import { DEFAULT_PROFILE_LOOKUP_RELAYS } from '@/services/nostr-bridge/profile-sync-cache';
import { cacheDelete, cacheGet, cacheSet } from '@/services/nostr-bridge/cache';
import { resubscribeOnQuotaClose } from '@/services/nostr-bridge/quota-resubscribe';
import { hasSeenWrap, markWrapSeen } from '@/services/nostr-bridge/wrap-ledger';

type Bridge = typeof import('@/services/nostr-bridge');

/** Default signed-in identity and relay; override per test when it matters. */
export const BRIDGE_MOCK_PUBKEY = 'f'.repeat(64);
export const BRIDGE_MOCK_RELAY = 'wss://relay.test';

const EMPTY_LIST: ReadonlyArray<never> = Object.freeze([]);
const EMPTY_RECORD: Readonly<Record<string, never>> = Object.freeze({});
const NO_FAVORITES = Object.freeze({ items: EMPTY_LIST, packAddresses: EMPTY_LIST, createdAt: 0 });
const NO_EARLIER = Object.freeze({
  loadEarlier: async () => null,
  loading: false,
  reachedStart: true,
  lastResult: null,
});

/**
 * A bridge instance a test wires by hand: only the methods it calls, each
 * checked against `BridgeImpl`'s real signature. `Partial` is the honest
 * shape here for the same reason the module mock is partial: an absent
 * method is `undefined` at runtime and a call to it fails loudly.
 */
export type BridgeFake = Partial<BridgeImpl>;

/**
 * What a test may hand to {@link bridgeMock}. Three members are relaxed from
 * `Partial<Bridge>`, each documented:
 * - `nostrActions` may be partial (an un-wired action throws when called,
 *   which is what a test wants);
 * - `getBridge` / `getBridgeImpl` resolve to a
 *   {@link BridgeFake} rather than a full `BridgeImpl`.
 * Everything else, including every hook, is the real module's own type.
 */
export type BridgeMock =
  & Omit<Partial<Bridge>, 'nostrActions' | 'getBridge' | 'getBridgeImpl'>
  & {
    nostrActions?: Partial<Bridge['nostrActions']>;
    getBridge?: () => Promise<BridgeFake>;
    getBridgeImpl?: () => BridgeFake | null;
  };

/**
 * One default per real export. Pinned with `satisfies` against the real
 * module twice over: every value here must match the real signature, and
 * (via `Required`) every export except the three bridge accessors and
 * `nostrActions` must have a default, so a new hook in `index.ts` fails here.
 */
const hookDefaults = {
  isImportableRelayUrl,
  // The local helpers the front door also exports (the profile-lookup relay
  // list, the localStorage event cache, the quota-close retry schedule, the
  // seen-wrap ledger) default to the real ones: none of them touches the
  // network or the client, and they are what the modules importing them ran
  // against before those modules moved off the side entrances. A suite that
  // needs a fake passes one as an override.
  DEFAULT_PROFILE_LOOKUP_RELAYS,
  cacheGet,
  cacheSet,
  cacheDelete,
  resubscribeOnQuotaClose,
  hasSeenWrap,
  markWrapSeen,
  useIsLoggedIn: () => true,
  useMyPubkey: () => BRIDGE_MOCK_PUBKEY,
  useNipSigner: () => null,
  useIsRehydrating: () => false,
  useConnectionState: () => 'Connected',
  useCurrentRelayUrl: () => BRIDGE_MOCK_RELAY,
  useConfiguredRelays: () => [BRIDGE_MOCK_RELAY],
  useMyContactList: () => null,
  useMyContactListReady: () => true,
  useMediaPacks: () => EMPTY_RECORD,
  useMyMediaFavorites: () => NO_FAVORITES,
  useMyFollows: () => EMPTY_LIST,
  useGroups: () => EMPTY_LIST,
  useGroupById: () => null,
  useGroupMetadataEose: () => true,
  useMessages: () => EMPTY_LIST,
  useMessagesByGroup: () => EMPTY_RECORD,
  useMessagesStatus: () => 'empty-confirmed' as const,
  useLoadEarlier: () => NO_EARLIER,
  useUserMetadata: () => null,
  useReactions: () => EMPTY_RECORD,
  useChildrenByParent: () => EMPTY_RECORD,
  useDirectMessages: () => EMPTY_RECORD,
  useAdmins: () => EMPTY_LIST,
  useAdminsByGroup: () => EMPTY_RECORD,
  useMembers: () => EMPTY_LIST,
  useMembersByGroup: () => EMPTY_RECORD,
  useGroupMemberInfo: () => EMPTY_LIST,
  useRelayPeople: () => EMPTY_LIST,
  useMembershipReady: () => true,
  useGroupCreator: () => null,
  useGroupCreators: () => EMPTY_RECORD,
  useMyMutes: () => EMPTY_LIST,
  useMyLoginMethod: () => 'nsec' as const,
  useSessionNotice: () => null,
  useBunkerSignerReady: () => false,
  useSignerReady: () => true,
  useRelayAccess: () => 'ok' as const,
  useActiveCall: () => null,
  useActiveCallByChannel: () => EMPTY_RECORD,
  // The provider renders its children and nothing else: a module mock has no
  // instance to hand out. `useBridge` follows the suite's `getBridgeImpl`
  // override (see `bridgeMock`), so a component moved from `getBridgeImpl()`
  // to `useBridge()` sees the same fake.
  BridgeProvider: ({ children }) => createElement(Fragment, null, children),
  useBridge: () => null,
  useBridgeReady: () => true,
  // Like the real hook under a provider whose bridge never arrives; follows
  // the suite's `getBridge` override when it has one (see `bridgeMock`).
  useAwaitBridge: () => () => new Promise<BridgeImpl>(() => {}),
  // A mocked bridge has no relay hub: a wallet connection in such a suite fails here, loudly.
  pageRelayHub: () => {
    throw new Error('pageRelayHub: the bridge is mocked in this suite');
  },
} satisfies Partial<Bridge> satisfies Required<Omit<Bridge, 'nostrActions' | 'getBridge' | 'getBridgeImpl'>>;

/**
 * A complete module mock: every hook has a default, every override is
 * checked against the real export's type. `getBridge` has no default on
 * purpose (a component that reaches for the bridge instance in a test that
 * did not wire one should fail at that line, not somewhere downstream);
 * `getBridgeImpl` defaults to `null`, the real "no bridge yet" answer.
 */
export function bridgeMock(overrides: BridgeMock = {}): BridgeMock {
  const getBridgeImpl = overrides.getBridgeImpl;
  const getBridge = overrides.getBridge;
  return {
    ...hookDefaults,
    getBridgeImpl: () => null,
    ...(getBridgeImpl ? { useBridge: () => (getBridgeImpl() as BridgeImpl | null) } : {}),
    ...(getBridge ? { useAwaitBridge: () => getBridge as () => Promise<BridgeImpl> } : {}),
    ...overrides,
    nostrActions: { ...overrides.nostrActions },
  };
}

/**
 * The same type pin without the defaults, for suites that spread the real
 * module (`...(await importOriginal())`) and replace a few members.
 */
export function bridgeOverrides(overrides: BridgeMock): BridgeMock {
  return overrides;
}

// ── fixtures ─────────────────────────────────────────────────────────────
// Complete records for the hooks whose return types are object shapes, so a
// test can say `groupFixture({ id: 'g' })` instead of a partial literal the
// types (rightly) reject.

export function groupFixture(over: Partial<JsGroup> & Pick<JsGroup, 'id'>): JsGroup {
  return {
    name: over.id,
    about: null,
    picture: null,
    banner: null,
    isPublic: true,
    isHidden: false,
    isRestricted: false,
    isOpen: true,
    parent: null,
    kind: 'text',
    forumTags: EMPTY_LIST,
    topics: EMPTY_LIST,
    ...over,
  };
}

export function userMetadataFixture(over: Partial<JsUserMetadata> = {}): JsUserMetadata {
  return {
    pubkey: BRIDGE_MOCK_PUBKEY,
    name: null,
    displayName: null,
    picture: null,
    about: null,
    nip05: null,
    banner: null,
    lud16: null,
    website: null,
    ...over,
  };
}

export function messageFixture(over: Partial<JsMessage> & Pick<JsMessage, 'id'>): JsMessage {
  return {
    pubkey: BRIDGE_MOCK_PUBKEY,
    content: '',
    createdAt: 0,
    kind: 9,
    replyToId: null,
    mentions: EMPTY_LIST,
    ...over,
  };
}

export function directMessageFixture(
  over: Partial<JsDirectMessage> & Pick<JsDirectMessage, 'id' | 'counterparty'>,
): JsDirectMessage {
  return {
    outgoing: false,
    content: '',
    createdAt: 0,
    ...over,
  };
}

export function memberInfoFixture(over: Partial<JsMemberInfo> & Pick<JsMemberInfo, 'pubkey'>): JsMemberInfo {
  return {
    displayName: over.pubkey.slice(0, 8),
    role: 'member',
    ...over,
  };
}
