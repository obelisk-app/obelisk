import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, act } from '@testing-library/react';

// Bridge identity hooks back the profile screen — mock them so the test can
// drive the rendered values without a real relay connection.
const mockLogout = vi.fn();
const mockEditUserMetadata = vi.fn().mockResolvedValue(undefined);

let mockMeta: {
  pubkey: string;
  name: string | null;
  displayName: string | null;
  picture: string | null;
  banner: string | null;
  about: string | null;
  nip05: string | null;
  lud16: string | null;
  website: string | null;
} | null = null;
let mockPubkey: string | null = null;

vi.mock('@/lib/nostr-bridge', () => ({
  nostrActions: {
    logout: (...a: unknown[]) => mockLogout(...a),
    editUserMetadata: (...a: unknown[]) => mockEditUserMetadata(...a),
    switchRelay: vi.fn(),
    removeRelay: vi.fn(),
    createGroup: vi.fn(),
    signEventTemplate: vi.fn(),
    ensureUserMetadata: vi.fn(),
  },
  useIsLoggedIn: () => true,
  useIsRehydrating: () => false,
  useMyPubkey: () => mockPubkey,
  useUserMetadata: () => mockMeta,
  useGroups: () => [],
  useChildrenByParent: () => ({}),
  useMessages: () => [],
  useLoadEarlier: () => ({ loadEarlier: vi.fn(), loading: false, reachedStart: true }),
  useDirectMessages: () => [],
  useAdmins: () => [],
  useAdminsByGroup: () => ({}),
  useMembers: () => [],
  useMyFollows: () => [],
  useReactions: () => ({}),
  useConfiguredRelays: () => ['wss://relay.obelisk.ar'],
  useCurrentRelayUrl: () => 'wss://relay.obelisk.ar',
  useRelayAccess: () => ({ status: 'ok' }),
  useConnectionState: () => 'connected',
  useGroupMetadataEose: () => true,
  useActiveCallByChannel: () => ({}),
}));

vi.mock('@/lib/relay-info', () => ({
  faviconFor: (url: string) => `https://favicon/${url}`,
  fetchRelayInfo: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/relay-branding', () => ({
  useRelayBranding: () => ({}),
  publishBranding: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/channel-layout', () => ({
  useChannelLayout: () => ({ categories: [], channels: [], updatedAt: 0 }),
  useRelayOperatorPubkey: () => null,
  applyLayout: () => ({ categories: [], uncategorized: [] }),
  publishLayout: vi.fn().mockResolvedValue(undefined),
  newCategoryId: () => 'cat-test',
}));

vi.mock('@/components/BlossomImageInput', () => ({
  default: ({ label }: { label: string }) => <div data-testid={`blossom-${label.toLowerCase()}`}>{label}</div>,
}));

vi.mock('@/lib/blossom', () => ({
  uploadToBlossom: vi.fn().mockResolvedValue('https://blossom.example/img.jpg'),
}));

vi.mock('@/components/admin/RelayAdminPanel', () => ({
  default: () => <div data-testid="relay-admin-panel-stub" />,
}));

import { SettingsProfileScreen, EditProfileScreen } from './PhoneShell';

const PUBKEY = '1'.repeat(64);

beforeEach(() => {
  mockPubkey = PUBKEY;
  mockMeta = {
    pubkey: PUBKEY,
    name: 'Fabricio',
    displayName: 'Fabricio',
    picture: 'https://example.com/avatar.jpg',
    banner: 'https://example.com/banner.jpg',
    about: 'Building Obelisk on Nostr.',
    nip05: 'fabri@hodl.ar',
    lud16: 'fabri@walletofsatoshi.com',
    website: 'https://obelisk.ar',
  };
});

afterEach(() => {
  mockLogout.mockReset();
  mockEditUserMetadata.mockReset().mockResolvedValue(undefined);
  vi.useRealTimers();
});

describe('SettingsProfileScreen', () => {
  it('renders the user banner when present', () => {
    render(<SettingsProfileScreen go={vi.fn()} />);
    const banner = screen.getByTestId('profile-banner');
    const img = banner.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('https://example.com/banner.jpg');
  });

  it('renders an empty banner placeholder when no banner is set', () => {
    mockMeta = { ...mockMeta!, banner: null };
    render(<SettingsProfileScreen go={vi.fn()} />);
    const banner = screen.getByTestId('profile-banner');
    expect(banner.querySelector('img')).toBeNull();
  });

  it('renders the user about/description when present', () => {
    render(<SettingsProfileScreen go={vi.fn()} />);
    const about = screen.getByTestId('profile-about');
    expect(about.textContent).toBe('Building Obelisk on Nostr.');
  });

  it('does not render the about block when no about is set', () => {
    mockMeta = { ...mockMeta!, about: null };
    render(<SettingsProfileScreen go={vi.fn()} />);
    expect(screen.queryByTestId('profile-about')).toBeNull();
  });

  it('shows "Copied!" feedback when the npub copy row is tapped', () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<SettingsProfileScreen go={vi.fn()} />);
    const npubBtn = screen.getByTestId('copy-npub');
    expect(npubBtn.className).not.toContain('copied');

    fireEvent.click(npubBtn);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toMatch(/^npub1/);
    expect(npubBtn.className).toContain('copied');
    expect(npubBtn.textContent).toContain('Copied!');

    act(() => { vi.advanceTimersByTime(1700); });
    expect(npubBtn.className).not.toContain('copied');
  });

  it('copies the hex pubkey verbatim from the hex copy row', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<SettingsProfileScreen go={vi.fn()} />);
    fireEvent.click(screen.getByTestId('copy-hex'));
    expect(writeText).toHaveBeenCalledWith(PUBKEY);
  });

  it('navigates to profile-edit when "Edit Nostr Profile" is tapped', () => {
    const go = vi.fn();
    render(<SettingsProfileScreen go={go} />);
    fireEvent.click(screen.getByTestId('edit-profile-btn'));
    expect(go).toHaveBeenCalledWith('profile-edit');
  });

  it('opens a confirmation sheet on Disconnect — does NOT log out immediately', () => {
    render(<SettingsProfileScreen go={vi.fn()} />);
    fireEvent.click(screen.getByTestId('disconnect-btn'));
    expect(mockLogout).not.toHaveBeenCalled();
    expect(screen.getByTestId('disconnect-confirm')).toBeTruthy();
  });

  it('calls logout only after the confirmation button is tapped', () => {
    render(<SettingsProfileScreen go={vi.fn()} />);
    fireEvent.click(screen.getByTestId('disconnect-btn'));
    fireEvent.click(screen.getByTestId('disconnect-confirm'));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});

describe('EditProfileScreen', () => {
  it('hydrates inputs from the current user metadata', () => {
    render(<EditProfileScreen go={vi.fn()} />);
    expect((screen.getByTestId('edit-name') as HTMLInputElement).value).toBe('Fabricio');
    expect((screen.getByTestId('edit-about') as HTMLTextAreaElement).value).toBe('Building Obelisk on Nostr.');
  });

  it('publishes via editUserMetadata and pops back on save', async () => {
    const go = vi.fn();
    render(<EditProfileScreen go={go} />);
    fireEvent.change(screen.getByTestId('edit-name'), { target: { value: 'Fabricio v2' } });
    fireEvent.change(screen.getByTestId('edit-about'), { target: { value: 'New bio' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-profile'));
    });
    expect(mockEditUserMetadata).toHaveBeenCalledTimes(1);
    const opts = mockEditUserMetadata.mock.calls[0][0];
    expect(opts.name).toBe('Fabricio v2');
    expect(opts.displayName).toBe('Fabricio v2');
    expect(opts.about).toBe('New bio');
    expect(go).toHaveBeenCalledWith('settings-profile', 'back');
  });

  it('blocks save when the display name is empty', () => {
    render(<EditProfileScreen go={vi.fn()} />);
    fireEvent.change(screen.getByTestId('edit-name'), { target: { value: '   ' } });
    const saveBtn = screen.getByTestId('save-profile') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });
});
