/**
 * A bridge instance for component and hook tests, built from seed values.
 *
 * Every store the facade exposes is a real `StateStore` here, seeded from
 * `seed` (or a signed-in default), and every `subscribeX` the facade has is
 * implemented over it, mirroring `facade-reads.ts` minus the REQ side
 * effects. Render the component under `<BridgeProvider bridge={fake}>`
 * (`render-with-bridge.tsx`) and the REAL hooks run: `useGroups` really
 * subscribes, `useUserMetadata(pk)` really calls `subscribeUserMetadata`, and
 * a service the component calls through `getBridgeImpl()` gets this same
 * object, all without `vi.mock`.
 *
 * Drive a change the way a relay would: `act(() => fake.stores.groups.set([...]))`.
 *
 * Commands are not stubbed: pass the ones the test needs as `methods`
 * (`{ logout: vi.fn() }`). A method the component calls that the test did not
 * wire is `undefined` and fails at that line, the same reason `BridgeFake` in
 * `mocks/nostr-bridge.ts` is a `Partial`.
 */
import type { BridgeImpl, MessagesStatus } from '@/services/nostr-bridge';
import { StateStore } from '@/services/nostr-bridge/common/state-store';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import { BRIDGE_MOCK_PUBKEY, BRIDGE_MOCK_RELAY } from '@tests/support/mocks/nostr-bridge';

/** The facade's store properties (`isLoggedIn`, `groups`, `userMetadata`, ...). */
export type StoreName = {
  [K in keyof BridgeImpl]-?: BridgeImpl[K] extends StateStore<infer _T> ? K : never;
}[keyof BridgeImpl];

type StoreValue<K extends StoreName> = BridgeImpl[K] extends StateStore<infer T> ? T : never;

/** One optional starting value per store; anything left out takes the signed-in default. */
export type FakeBridgeSeed = { [K in StoreName]?: StoreValue<K> };

export type FakeStores = { readonly [K in StoreName]: StateStore<StoreValue<K>> };

export type FakeBridge = BridgeImpl & { readonly stores: FakeStores };

/**
 * A signed-in member on `BRIDGE_MOCK_RELAY`, the same identity `bridgeMock`
 * defaults to. Typed as a complete map, so a store added to the facade fails
 * the typecheck here until it has a default.
 */
const DEFAULTS: { readonly [K in StoreName]: () => StoreValue<K> } = {
  relayAccess: () => ({ [normalizeRelayUrl(BRIDGE_MOCK_RELAY)]: 'ok' }),
  connectionState: () => 'Connected',
  currentRelayUrl: () => BRIDGE_MOCK_RELAY,
  configuredRelays: () => [BRIDGE_MOCK_RELAY],
  isLoggedIn: () => true,
  isRestoringSession: () => false,
  myPubkey: () => BRIDGE_MOCK_PUBKEY,
  myLoginMethod: () => 'nsec',
  bunkerSignerReady: () => false,
  sessionNotice: () => null,
  groups: () => [],
  groupMetadataEose: () => true,
  childrenByParent: () => ({}),
  adminsByGroup: () => ({}),
  membersByGroup: () => ({}),
  membershipReadyByGroup: () => ({}),
  groupCreators: () => ({}),
  messagesByGroup: () => ({}),
  messagesStatusByGroup: () => ({}),
  reactionsByGroup: () => ({}),
  myMutes: () => [],
  dmsByPeer: () => ({}),
  // Open, so DM surfaces render as they did before the store existed; a
  // test of the locked state seeds `{ status: 'locked', unopened: [...] }`.
  dmLock: () => ({ status: 'unlocked', unopened: [] }),
  userMetadata: () => ({}),
  myContactList: () => null,
  myContactListReady: () => true,
  mediaPacks: () => ({}),
  myMediaFavorites: () => ({ items: [], packAddresses: [], createdAt: 0 }),
  activeCallByChannel: () => ({}),
};

/** The names of every store, from the defaults (the facade's own list, checked by the type above). */
export const FAKE_BRIDGE_STORES = Object.keys(DEFAULTS) as StoreName[];

const EMPTY: readonly never[] = Object.freeze([]);
const EMPTY_RECORD: Readonly<Record<string, never>> = Object.freeze({});

function makeStores(seed: FakeBridgeSeed): FakeStores {
  const out: Record<string, StateStore<unknown>> = {};
  for (const name of FAKE_BRIDGE_STORES) {
    const seeded = (seed as Record<string, unknown>)[name];
    out[name] = new StateStore<unknown>(seeded !== undefined ? seeded : DEFAULTS[name]());
  }
  return out as unknown as FakeStores;
}

/** `facade-reads.ts`, one line each, without the REQs a real subscribe opens. */
function reads(s: FakeStores) {
  const status = (m: Readonly<Record<string, MessagesStatus>>, g: string): MessagesStatus => m[g] ?? 'loading';
  return {
    subscribeConfiguredRelays: (cb) => s.configuredRelays.subscribe(cb),
    subscribeSessionGeneration: (cb) => { cb(0); return () => {}; },
    subscribeIsRestoringSession: (cb) => s.isRestoringSession.subscribe(cb),
    subscribeIsLoggedIn: (cb) => s.isLoggedIn.subscribe(cb),
    subscribeRelayAccess: (cb) => s.relayAccess.subscribe(cb),
    subscribeConnectionState: (cb) => s.connectionState.subscribe(cb),
    subscribeCurrentRelayUrl: (cb) => s.currentRelayUrl.subscribe(cb),
    subscribeMyPubkey: (cb) => s.myPubkey.subscribe(cb),
    subscribeMyLoginMethod: (cb) => s.myLoginMethod.subscribe(cb),
    subscribeBunkerSignerReady: (cb) => s.bunkerSignerReady.subscribe(cb),
    subscribeSessionNotice: (cb) => s.sessionNotice.subscribe(cb),
    subscribeGroups: (cb) => s.groups.subscribe(cb),
    subscribeGroupMetadataEose: (cb) => s.groupMetadataEose.subscribe(cb),
    subscribeMessages: (g, cb) => s.messagesByGroup.subscribe((m) => cb(m[g] ?? EMPTY)),
    subscribeMessagesByGroup: (cb) => s.messagesByGroup.subscribe(cb),
    subscribeMessagesStatus: (g, cb) => s.messagesStatusByGroup.subscribe((m) => cb(status(m, g))),
    subscribeUserMetadata: (pk, cb) => s.userMetadata.subscribe((m) => cb(m[pk] ?? null)),
    subscribeUserMetadataMap: (cb) => s.userMetadata.subscribe(cb),
    subscribeReactions: (g, cb) => s.reactionsByGroup.subscribe((m) => cb(m[g] ?? EMPTY_RECORD)),
    subscribeChildrenByParent: (cb) => s.childrenByParent.subscribe(cb),
    subscribeDirectMessages: (cb) => s.dmsByPeer.subscribe(cb),
    subscribeDmLock: (cb) => s.dmLock.subscribe(cb),
    subscribeMyContactList: (cb) => s.myContactList.subscribe(cb),
    subscribeMyContactListReady: (cb) => s.myContactListReady.subscribe(cb),
    subscribeMediaPacks: (cb) => s.mediaPacks.subscribe(cb),
    subscribeMyMediaFavorites: (cb) => s.myMediaFavorites.subscribe(cb),
    subscribeMyMutes: (cb) => s.myMutes.subscribe(cb),
    subscribeAdmins: (g, cb) => s.adminsByGroup.subscribe((m) => cb(m[g] ?? EMPTY)),
    subscribeAdminsByGroup: (cb) => s.adminsByGroup.subscribe(cb),
    subscribeMembers: (g, cb) => s.membersByGroup.subscribe((m) => cb(m[g] ?? EMPTY)),
    subscribeMembersByGroup: (cb) => s.membersByGroup.subscribe(cb),
    subscribeMembershipReady: (g, cb) => s.membershipReadyByGroup.subscribe((m) => cb(!!m[g])),
    subscribeGroupCreators: (cb) => s.groupCreators.subscribe(cb),
    subscribeActiveCallByChannel: (cb) => s.activeCallByChannel.subscribe(cb),
    subscribeDmCallMessages: () => () => {},
    getPublicKey: () => s.myPubkey.get(),
    getSessionGeneration: () => 0,
    displayNameFor: (pk) => {
      const meta = s.userMetadata.get()[pk];
      return meta?.displayName || meta?.name || `${pk.slice(0, 8)}…`;
    },
  } satisfies Partial<BridgeImpl>;
}

/**
 * Build a fake bridge. `seed` sets store values (the rest are the signed-in
 * defaults); `methods` adds or replaces members, commands included.
 */
export function fakeBridge(seed: FakeBridgeSeed = {}, methods: Partial<BridgeImpl> = {}): FakeBridge {
  const stores = makeStores(seed);
  return Object.assign({ stores }, stores, reads(stores), methods) as unknown as FakeBridge;
}
