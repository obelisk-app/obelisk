/**
 * Shared bridge wiring for the two channel composers (desktop ChatComposer
 * and mobile ChannelComposer): a signed-in member of group `g` whose
 * metadata store knows Alice, enough for the real `useChannelComposer` to
 * run without a relay.
 */
import { vi } from 'vitest';
import type { JsGroup, JsUserMetadata } from '@/services/nostr-bridge';
import { StateStore } from '@/services/nostr-bridge/common/state-store';
import { groupFixture, userMetadataFixture } from '@tests/support/mocks/nostr-bridge';

export const COMPOSER_ME = 'b'.repeat(64);
export const COMPOSER_ALICE = 'a'.repeat(64);
export const sendMessage = vi.fn();

const bridgeImpl = {
  userMetadata: new StateStore<Record<string, JsUserMetadata>>({
    [COMPOSER_ALICE]: userMetadataFixture({ pubkey: COMPOSER_ALICE, displayName: 'Alice', name: 'alice' }),
  }),
  membersByGroup: new StateStore<Record<string, string[]>>({ g: [COMPOSER_ALICE, COMPOSER_ME] }),
  subscribeUserMetadata: () => () => {},
};

export async function composerBridgeMock() {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    getBridge: () => Promise.resolve(bridgeImpl),
    getBridgeImpl: () => bridgeImpl,
    nostrActions: { sendMessage: (...a: unknown[]) => sendMessage(...a) },
    useMyPubkey: () => COMPOSER_ME,
    useCurrentRelayUrl: () => 'wss://relay.example',
    useRelayAccess: () => 'ok',
    useAdmins: () => [],
    useMembers: () => [COMPOSER_ALICE, COMPOSER_ME],
    useGroups: () => [GROUP],
    useMembersByGroup: () => ({ g: [COMPOSER_ALICE, COMPOSER_ME] }),
    useAdminsByGroup: () => ({}),
    useGroupCreators: () => ({}),
  });
}

export const GROUP: JsGroup = groupFixture({ id: 'g', name: 'general' });
