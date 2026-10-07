import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { useChatStore } from '@/store/chat';
import { fakeBridge } from '@tests/support/fake-bridge';
import { groupFixture, userMetadataFixture } from '@tests/support/mocks/nostr-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';

const roster = { admins: [] as string[], members: [] as string[] };

vi.mock('@/hooks/chat/useNostrPresence', () => ({
  useNostrPresence: () => undefined,
  PRESENCE_WINDOW_MS: 15 * 60 * 1000,
  presenceActivityKey: (relay: string, pubkey: string) => `${relay}:${pubkey}`,
}));

vi.mock('@/hooks/useNostrUserSearch', () => ({ useNostrUserSearch: () => ({ results: [], loading: false }) }));
vi.mock('@/services/relay-info', () => ({ faviconFor: () => '', fetchRelayInfo: vi.fn().mockResolvedValue(null) }));
vi.mock('@/services/relay-branding', () => ({
  publishBranding: vi.fn(),
}));
vi.mock('@/hooks/relay/useRelayBranding', () => ({
  useRelayBranding: () => ({}),
}));
vi.mock('@/services/relay-emojis', () => ({
  relayEmojiMap: () => ({}),
  relayMediaKindMap: () => ({}),
  resolveRelayEmojiSet: (set: unknown) => set,
  publishRelayEmojiSet: vi.fn(),
}));
vi.mock('@/hooks/relay/useRelayEmojiSet', () => ({
  useRelayEmojiSet: () => ({ title: '', emojis: [], updatedAt: 0 }),
}));
vi.mock('@/services/channel-layout', () => ({
  applyLayout: () => ({ categories: [], uncategorized: [] }),
  publishLayout: vi.fn(),
  newCategoryId: () => 'cat-test',
}));
vi.mock('@/hooks/relay/useChannelLayout', () => ({
  useChannelLayout: () => ({ categories: [], channels: [], updatedAt: 0 }),
}));
vi.mock('@/hooks/relay/useRelayOperatorPubkey', () => ({
  useRelayOperatorPubkey: () => null,
}));
vi.mock('@/services/relay-roles', () => ({
  rolesByPubkey: () => ({}),
}));
vi.mock('@/hooks/relay/useRelayRoles', () => ({
  useRelayRoles: () => ({ roles: [], holders: {}, updatedAt: 0 }),
}));
vi.mock('@/components/media/BlossomImageInput', () => ({
  default: () => null,
  ChannelAppearanceInput: () => null,
}));
vi.mock('@/components/admin/relay-admin/RelayAdminPanel', () => ({ default: () => null }));
vi.mock('@/components/admin/RelayEmojiAdminModal', () => ({ default: () => null }));
vi.mock('@/components/admin/RelayRolesAdminModal', () => ({ default: () => null }));

import { MemberListScreen } from '@/app/[locale]/app/mobile/screens/MemberListScreen';
const MOD = { id: 'mod', name: 'Moderator', tier: 5, color: '#ff0000', emoji: '🛡️' };
const OG = { id: 'og', name: 'OG', tier: 2, color: '#00ff00', emoji: '' };

/** The real hooks over a fake bridge: `roster` in `group-1`, everyone named by their key. */
function renderScreen() {
  const everyone = [...new Set([...roster.admins, ...roster.members])];
  const bridge = fakeBridge({
    configuredRelays: ['wss://relay.test'],
    currentRelayUrl: 'wss://relay.test',
    groups: [groupFixture({ id: 'group-1', name: 'general' })],
    adminsByGroup: { 'group-1': roster.admins },
    membersByGroup: { 'group-1': roster.members },
    userMetadata: Object.fromEntries(everyone.map((pubkey) => [pubkey, userMetadataFixture({ pubkey, displayName: pubkey })])),
  }, { ensureUserMetadata: vi.fn().mockResolvedValue(undefined) });
  return renderWithBridge(
    <MemberListScreen groupId="group-1" back={() => {}} openProfile={() => {}} />,
    bridge,
  );
}

describe('mobile MemberListScreen', () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState());
    roster.admins = ['alice'];
    roster.members = ['alice', 'mallory', 'oscar', 'pia'];
  });

  it('sections members by rank under the admins', () => {
    useChatStore.getState().setRolesByPubkey({
      mallory: [MOD],
      oscar: [OG],
      // An admin's role does not pull them out of the admin section.
      alice: [OG],
    });
    renderScreen();

    const labels = Array.from(document.querySelectorAll('.member-section-label')).map((n) => n.textContent);
    expect(labels).toEqual(['Admins · 1', '🛡️ Moderator · 1', 'OG · 1', 'Members · 1']);
    expect(within(screen.getByTestId('member-section-mod')).getByText('mallory')).toBeInTheDocument();
    expect(within(screen.getByTestId('member-section-og')).getByText('oscar')).toBeInTheDocument();
    expect(within(screen.getByTestId('member-section-member')).getByText('pia')).toBeInTheDocument();
  });

  it('keeps a single members section when nobody holds a role', () => {
    renderScreen();

    const labels = Array.from(document.querySelectorAll('.member-section-label')).map((n) => n.textContent);
    expect(labels).toEqual(['Admins · 1', 'Members · 3']);
  });
});
