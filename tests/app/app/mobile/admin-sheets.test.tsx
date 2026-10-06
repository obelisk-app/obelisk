import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '@/i18n/context';

// Bridge actions live behind a singleton + IndexedDB-backed cache. The
// admin-sheet tests only care that:
//   1. The right rows render given the isAdmin flag
//   2. Tapping the "Create channel" submit calls nostrActions.createGroup
// so we mock the bridge module wholesale here.

const mockCreateGroup = vi.fn();
const mockEditGroupMetadata = vi.fn();
const mockSwitchRelay = vi.fn();
const mockRemoveRelay = vi.fn();
const mockUserSearch = vi.fn();

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    nostrActions: {
      createGroup: (...a: unknown[]) => mockCreateGroup(...a),
      editGroupMetadata: (...a: unknown[]) => mockEditGroupMetadata(...a),
      switchRelay: (...a: unknown[]) => mockSwitchRelay(...a),
      removeRelay: (...a: unknown[]) => mockRemoveRelay(...a),
    },
    useConfiguredRelays: () => ['wss://lacrypta-relay.obelisk.ar'],
    useCurrentRelayUrl: () => 'wss://lacrypta-relay.obelisk.ar',
  });
});

const mockResolveSfuPin = vi.fn();
const mockFetchSfuInfo = vi.fn();
const mockPublishSfuPin = vi.fn();
vi.mock('@/services/voice/sfu-pin', () => ({
  resolveSfuPin: (...a: unknown[]) => mockResolveSfuPin(...a),
  fetchSfuInfo: (...a: unknown[]) => mockFetchSfuInfo(...a),
  publishSfuPin: (...a: unknown[]) => mockPublishSfuPin(...a),
}));

vi.mock('@/hooks/useNostrUserSearch', () => ({
  useNostrUserSearch: (...a: unknown[]) => mockUserSearch(...a),
}));

vi.mock('@/services/relay-info', () => ({
  faviconFor: (url: string) => `https://favicon/${url}`,
  fetchRelayInfo: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/services/relay-branding', () => ({
  publishBranding: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/hooks/relay/useRelayBranding', () => ({
  useRelayBranding: () => ({}),
}));

vi.mock('@/services/relay-emojis', () => ({
  relayEmojiMap: () => ({}),
  publishRelayEmojiSet: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/hooks/relay/useRelayEmojiSet', () => ({
  useRelayEmojiSet: () => ({ title: '', emojis: [], updatedAt: 0 }),
}));

vi.mock('@/services/channel-layout', () => ({
  applyLayout: () => ({ categories: [], uncategorized: [] }),
  publishLayout: vi.fn().mockResolvedValue(undefined),
  newCategoryId: () => 'cat-test',
}));
vi.mock('@/hooks/relay/useChannelLayout', () => ({
  useChannelLayout: () => ({ categories: [], channels: [], updatedAt: 0 }),
}));
vi.mock('@/hooks/relay/useRelayOperatorPubkey', () => ({
  useRelayOperatorPubkey: () => null,
}));

vi.mock('@/components/media/BlossomImageInput', () => ({
  default: ({ label }: { label: string }) => <div data-testid={`blossom-${label.toLowerCase()}`}>{label}</div>,
  ChannelAppearanceInput: () => <div data-testid="channel-appearance-preview" />,
}));

vi.mock('@/components/admin/RelayAdminPanel', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="relay-admin-panel-stub" onClick={onClose}>panel</div>
  ),
}));

vi.mock('@/components/admin/RelayEmojiAdminModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="relay-emoji-admin-stub" onClick={onClose}>emoji panel</div>
  ),
}));

import { ComposeDmScreen } from '@/app/app/mobile/screens/ComposeDmScreen';
import { DmsListScreen } from '@/app/app/mobile/screens/DmsListScreen';
import { ChannelSettingsSheet } from '@/app/app/mobile/sheets/ChannelSettingsSheet';
import { CreateChannelSheet } from '@/app/app/mobile/sheets/CreateChannelSheet';
import { RelayMenuSheet } from '@/app/app/mobile/sheets/RelayMenuSheet';
/** Every screen in the shell reads copy from the dictionary now. */
const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);


afterEach(() => {
  mockResolveSfuPin.mockReset();
  mockFetchSfuInfo.mockReset();
  mockPublishSfuPin.mockReset();
  mockCreateGroup.mockReset();
  mockEditGroupMetadata.mockReset();
  mockSwitchRelay.mockReset();
  mockRemoveRelay.mockReset();
  mockUserSearch.mockReset().mockReturnValue({ directHit: null, nip05Hit: null, nostrResults: [], loading: false });
});

describe('CreateChannelSheet', () => {
  it('submits the trimmed name with public+open defaults and routes to the new channel', async () => {
    mockCreateGroup.mockResolvedValueOnce('rly/abc123');
    const onCreated = vi.fn();
    const close = vi.fn();
    renderLocalized(
      <CreateChannelSheet
        relayLabel="lacrypta-relay.obelisk.ar"
        close={close}
        onCreated={onCreated}
      />,
    );

    const input = screen.getByTestId('mobile-create-channel-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  general ' } });

    const submit = screen.getByTestId('mobile-create-channel-submit');
    fireEvent.click(submit);

    await vi.waitFor(() => expect(mockCreateGroup).toHaveBeenCalledTimes(1));
    expect(mockCreateGroup).toHaveBeenCalledWith({
      name: 'general',
      isPublic: true,
      isOpen: true,
    });
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith('rly/abc123'));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('keeps the submit button disabled while the channel name is empty', () => {
    renderLocalized(
      <CreateChannelSheet
        relayLabel="lacrypta-relay.obelisk.ar"
        close={() => {}}
        onCreated={() => {}}
      />,
    );
    const submit = screen.getByTestId('mobile-create-channel-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.getByTestId('mobile-create-channel-input')).not.toHaveAttribute('autofocus');
  });
});

describe('ChannelSettingsSheet layout', () => {
  it('shows appearance before name and description', () => {
    renderLocalized(
      <ChannelSettingsSheet
        close={() => {}}
        group={{
          id: 'channel-1',
          name: 'General',
          about: 'Chat',
          picture: null,
          banner: null,
          isPublic: true,
          isHidden: false,
          isRestricted: false,
          isOpen: true,
          parent: null,
          kind: 'text',
          forumTags: [],
          topics: [],
        }}
      />,
    );

    const preview = screen.getByTestId('channel-appearance-preview');
    const name = screen.getByTestId('mobile-channel-settings-name');
    const description = screen.getByText('Description');
    expect(preview.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(name.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('ChannelSettingsSheet access presets', () => {
  it.each([
    ['read-only', 'mobile-channel-access-read-only', { isPublic: true, isHidden: false, isRestricted: true, isOpen: false }],
    ['private', 'mobile-channel-access-private', { isPublic: false, isHidden: true, isRestricted: true, isOpen: false }],
  ])('publishes %s as relay-enforced NIP-29 flags', async (_label, testId, expected) => {
    mockEditGroupMetadata.mockResolvedValueOnce(undefined);
    const close = vi.fn();
    renderLocalized(
      <ChannelSettingsSheet
        close={close}
        group={{
          id: 'channel-1',
          name: 'General',
          about: null,
          picture: null,
          banner: null,
          isPublic: true,
          isHidden: false,
          isRestricted: false,
          isOpen: true,
          parent: null,
          kind: 'text',
          forumTags: [],
          topics: [],
        }}
      />,
    );

    fireEvent.click(screen.getByTestId(testId));
    fireEvent.click(screen.getByTestId('mobile-channel-settings-save'));

    await vi.waitFor(() => expect(mockEditGroupMetadata).toHaveBeenCalledTimes(1));
    expect(mockEditGroupMetadata).toHaveBeenCalledWith(expect.objectContaining(expected));
    expect(close).toHaveBeenCalledTimes(1);
  });
});

const TEXT_GROUP = {
  id: 'channel-1',
  name: 'General',
  about: null,
  picture: null,
  banner: null,
  isPublic: true,
  isHidden: false,
  isRestricted: false,
  isOpen: true,
  parent: null,
  kind: 'text' as const,
  forumTags: [],
  topics: [],
};

describe('ChannelSettingsSheet SFU guard', () => {
  // Before the shared form hook, the phone sheet published `kind: 'voice-sfu'`
  // with no SFU check at all, which desktop explicitly guards against so a
  // bad SFU URL cannot leave the channel switched without a usable pin.
  it('refuses to switch to voice-sfu when the SFU cannot be verified', async () => {
    mockResolveSfuPin.mockResolvedValue(null);
    mockFetchSfuInfo.mockRejectedValueOnce(new Error('sfu unreachable'));
    const close = vi.fn();
    renderLocalized(<ChannelSettingsSheet close={close} group={TEXT_GROUP} />);

    fireEvent.click(screen.getByRole('button', { name: 'Voice (SFU)' }));
    const url = await screen.findByTestId('mobile-sfu-url') as HTMLInputElement;
    await vi.waitFor(() => expect(url.value).not.toBe(''));
    fireEvent.click(screen.getByTestId('mobile-channel-settings-save'));

    await vi.waitFor(() => expect(mockFetchSfuInfo).toHaveBeenCalledTimes(1));
    await screen.findByText('sfu unreachable');
    expect(mockEditGroupMetadata).not.toHaveBeenCalled();
    expect(mockPublishSfuPin).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('verifies the SFU, saves voice-sfu and publishes the pin', async () => {
    mockResolveSfuPin.mockResolvedValue(null);
    mockFetchSfuInfo.mockResolvedValueOnce({
      pubkey: 'f'.repeat(64), url: 'https://sfu.example', relays: ['wss://r'], trustedRelays: ['wss://r'], cap: 20, operator: null, region: null,
    });
    mockEditGroupMetadata.mockResolvedValueOnce(undefined);
    mockPublishSfuPin.mockResolvedValueOnce(undefined);
    const close = vi.fn();
    renderLocalized(<ChannelSettingsSheet close={close} group={TEXT_GROUP} />);

    fireEvent.click(screen.getByRole('button', { name: 'Voice (SFU)' }));
    const url = await screen.findByTestId('mobile-sfu-url') as HTMLInputElement;
    await vi.waitFor(() => expect(url.value).not.toBe(''));
    fireEvent.change(url, { target: { value: 'https://sfu.example' } });
    fireEvent.click(screen.getByTestId('mobile-channel-settings-save'));

    await vi.waitFor(() => expect(mockEditGroupMetadata).toHaveBeenCalledWith(expect.objectContaining({ kind: 'voice-sfu' })));
    await vi.waitFor(() => expect(mockPublishSfuPin).toHaveBeenCalledWith('channel-1', expect.objectContaining({ pubkey: 'f'.repeat(64), url: 'https://sfu.example' })));
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('ChannelSettingsSheet forum tags', () => {
  it('lets a phone admin curate the tag set and republishes it in full', async () => {
    mockResolveSfuPin.mockResolvedValue(null);
    mockEditGroupMetadata.mockResolvedValueOnce(undefined);
    renderLocalized(
      <ChannelSettingsSheet
        close={() => {}}
        group={{ ...TEXT_GROUP, kind: 'forum', forumTags: [{ id: 'news', name: 'News', emoji: null, color: null }] }}
      />,
    );
    const editor = screen.getByTestId('mobile-forum-tags-editor');
    expect(editor).toBeTruthy();
    fireEvent.change(screen.getByTestId('forum-tag-name-news'), { target: { value: 'Headlines' } });
    fireEvent.click(screen.getByTestId('mobile-channel-settings-save'));
    await vi.waitFor(() => expect(mockEditGroupMetadata).toHaveBeenCalledTimes(1));
    expect(mockEditGroupMetadata).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'forum',
      forumTags: [{ id: 'news', name: 'Headlines', emoji: null, color: null }],
    }));
  });
});

describe('RelayMenuSheet rows', () => {
  it('keeps the same row elements across a re-render of the sheet', () => {
    // `Row` used to be declared inside the sheet, so every render produced a
    // new component type and React remounted every row: fresh DOM nodes on
    // each busy-hint or toast change, and focus lost with them.
    renderLocalized(
      <RelayMenuSheet
        close={() => {}}
        relayUrl="wss://lacrypta-relay.obelisk.ar"
        label="Obelisk"
        isAdmin
        branding={{ icon: '', banner: '', name: '', description: '', updatedAt: 0 }}
        layout={{ categories: [], channels: [], updatedAt: 0 }}
        rootChannels={[]}
      />,
    );
    const branding = screen.getByText('Edit branding').closest('button')!;
    const invite = screen.getByText('Invite people…').closest('button')!;
    invite.focus();
    expect(document.activeElement).toBe(invite);

    // Tapping Invite flips the busy hint, which re-renders the sheet.
    fireEvent.click(invite);

    expect(screen.getByText('Edit branding').closest('button')).toBe(branding);
    expect(screen.getByText('Invite people…').closest('button')).toBe(invite);
    expect(document.activeElement).toBe(invite);
  });
});

describe('RelayMenuSheet admin gating', () => {
  it('hides the admin section for non-admins', () => {
    renderLocalized(
      <RelayMenuSheet
        close={() => {}}
        relayUrl="wss://lacrypta-relay.obelisk.ar"
        label="Obelisk"
        isAdmin={false}
      />,
    );
    expect(screen.queryByTestId('mobile-relay-admin-section')).toBeNull();
    expect(screen.queryByText('Edit branding')).toBeNull();
    expect(screen.queryByText('Emoji, GIFs & stickers')).toBeNull();
    expect(screen.queryByText('Categories & order')).toBeNull();
    expect(screen.queryByText('Admins & members')).toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('relay-menu-close');
  });

  it('renders the relay admin entries for admins', () => {
    renderLocalized(
      <RelayMenuSheet
        close={() => {}}
        relayUrl="wss://lacrypta-relay.obelisk.ar"
        label="Obelisk"
        isAdmin
        branding={{ icon: '', banner: '', name: '', description: '', updatedAt: 0 }}
        layout={{ categories: [], channels: [], updatedAt: 0 }}
        rootChannels={[]}
      />,
    );
    expect(screen.getByTestId('mobile-relay-admin-section')).toBeTruthy();
    expect(screen.getByText('Edit branding')).toBeTruthy();
    expect(screen.getByText('Emoji, GIFs & stickers')).toBeTruthy();
    expect(screen.getByText('Categories & order')).toBeTruthy();
    expect(screen.getByText('Admins & members')).toBeTruthy();
  });

  it('opens the emoji admin panel when the admin taps "Emoji, GIFs & stickers"', () => {
    renderLocalized(
      <RelayMenuSheet
        close={() => {}}
        relayUrl="wss://lacrypta-relay.obelisk.ar"
        label="Obelisk"
        isAdmin
        branding={{ icon: '', banner: '', name: '', description: '', updatedAt: 0 }}
        emojiSet={{ title: '', emojis: [], updatedAt: 0 }}
        layout={{ categories: [], channels: [], updatedAt: 0 }}
        rootChannels={[]}
      />,
    );
    fireEvent.click(screen.getByText('Emoji, GIFs & stickers'));
    expect(screen.getByTestId('relay-emoji-admin-stub')).toBeTruthy();
  });

  it('opens the RelayAdminPanel when the admin taps "Admins & members"', () => {
    renderLocalized(
      <RelayMenuSheet
        close={() => {}}
        relayUrl="wss://lacrypta-relay.obelisk.ar"
        label="Obelisk"
        isAdmin
        branding={{ icon: '', banner: '', name: '', description: '', updatedAt: 0 }}
        layout={{ categories: [], channels: [], updatedAt: 0 }}
        rootChannels={[]}
      />,
    );
    fireEvent.click(screen.getByText('Admins & members'));
    expect(screen.getByTestId('relay-admin-panel-stub')).toBeTruthy();
  });
});

describe('mobile DM search', () => {
  it('opens user search from the DMs search button', () => {
    const go = vi.fn();
    render(<LocaleProvider initialLocale="en"><DmsListScreen go={go} selectPeer={() => {}} myFollows={[]} /></LocaleProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(go).toHaveBeenCalledWith('compose-dm');
  });

  it('searches Nostr profiles and opens the selected DM', () => {
    const pubkey = 'a'.repeat(64);
    mockUserSearch.mockReturnValue({
      directHit: null,
      nip05Hit: null,
      nostrResults: [{ pubkey, displayName: 'Alice', picture: null, nip05: 'alice.com' }],
      loading: false,
    });
    const selectPeer = vi.fn();
    render(<LocaleProvider initialLocale="en"><ComposeDmScreen back={() => {}} selectPeer={selectPeer} /></LocaleProvider>);
    fireEvent.change(screen.getByPlaceholderText('Name, NIP-05, or npub'), { target: { value: 'alice' } });
    fireEvent.click(screen.getByTestId('mobile-user-search-result'));
    expect(selectPeer).toHaveBeenCalledWith(pubkey);
  });
});

describe('mobile sheet field labels', () => {
  it('CreateChannelSheet names its channel-name field by the visible label', () => {
    renderLocalized(<CreateChannelSheet relayLabel="relay.test" close={() => {}} onCreated={() => {}} />);
    expect(screen.getByLabelText('Channel name · on relay.test')).toBe(screen.getByTestId('mobile-create-channel-input'));
  });

  it('ChannelSettingsSheet names name, description, member and make-admin controls', () => {
    renderLocalized(<ChannelSettingsSheet close={() => {}} group={TEXT_GROUP} />);
    expect(screen.getByLabelText('Name')).toBe(screen.getByTestId('mobile-channel-settings-name'));
    expect(screen.getByLabelText('Description').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('Add member · NIP-29 kind 9000')).toHaveAttribute('placeholder', 'npub1… or 64-char hex');
    expect(screen.getByRole('checkbox', { name: 'Make admin' })).toBeInTheDocument();
  });

  it('ComposeDmScreen names the recipient field by its "To:" label', () => {
    render(<LocaleProvider initialLocale="en"><ComposeDmScreen back={() => {}} selectPeer={() => {}} /></LocaleProvider>);
    expect(screen.getByLabelText('To:')).toBe(screen.getByPlaceholderText('Name, NIP-05, or npub'));
    expect(screen.getByLabelText('To:')).toHaveClass('compose-dm-to-input');
  });
});
