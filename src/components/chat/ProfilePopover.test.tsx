import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ProfilePopover from './ProfilePopover';
import { useChatStore } from '@/store/chat';
import { LocaleProvider } from '@/i18n/context';

const bridge = vi.hoisted(() => ({
  members: [] as Array<{ pubkey: string; displayName: string; picture?: string; nip05?: string; role: 'admin' | 'member' }>,
  metadata: null as null | {
    pubkey: string;
    name: string | null;
    displayName: string | null;
    picture: string | null;
    about: string | null;
    nip05: string | null;
    banner: string | null;
    lud16: string | null;
    website: string | null;
  },
}));

const me = vi.hoisted(() => ({ pubkey: null as string | null }));

vi.mock('@/lib/nostr-bridge', () => ({
  useGroupMemberInfo: () => bridge.members,
  useMyPubkey: () => me.pubkey,
  useUserMetadata: () => bridge.metadata,
}));

vi.mock('@nostr-wot/data', () => ({
  formatPubkey: vi.fn((pubkey: string) => `${pubkey.slice(0, 8)}…`),
  hexToNpub: vi.fn((pubkey: string) => `npub1${pubkey}`),
}));

const PUBKEY = 'a'.repeat(64);

function renderProfile(onClose = vi.fn(), onExplore = vi.fn(), onMessage?: (pubkey: string) => void) {
  render(
    <LocaleProvider initialLocale="en">
      <ProfilePopover pubkey={PUBKEY} onClose={onClose} onExplore={onExplore} onMessage={onMessage} />
    </LocaleProvider>,
  );
}

describe('ProfilePopover', () => {
  beforeEach(() => {
    me.pubkey = null;
    useChatStore.setState({ ...useChatStore.getInitialState(), activeChannelId: 'group' });
    bridge.members = [{
      pubkey: PUBKEY,
      displayName: 'AndyCreed',
      picture: 'https://example.com/pic.jpg',
      role: 'admin',
    }];
    bridge.metadata = {
      pubkey: PUBKEY,
      name: 'andy',
      displayName: 'AndyCreed',
      picture: 'https://example.com/pic.jpg',
      banner: 'https://example.com/banner.jpg',
      nip05: 'andycreed@example.com',
      about: 'Building stuff',
      lud16: null,
      website: null,
    };
  });

  it('combines relay membership with kind:0 profile metadata', () => {
    renderProfile();
    expect(screen.getByTestId('profile-name')).toHaveTextContent('AndyCreed');
    expect(screen.getByTestId('profile-handle')).toHaveTextContent('andycreed@example.com');
    expect(screen.getByTestId('profile-about')).toHaveTextContent('Building stuff');
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('renders the kind:0 banner', () => {
    renderProfile();
    expect(screen.getByTestId('profile-banner').style.backgroundImage).toContain('banner.jpg');
  });

  it('falls back to a short npub without relay or profile data', () => {
    bridge.members = [];
    bridge.metadata = null;
    renderProfile();
    expect(screen.getByTestId('profile-handle')).toHaveTextContent('npub1');
  });

  it('closes from the backdrop', () => {
    const onClose = vi.fn();
    renderProfile(onClose);
    fireEvent.click(screen.getByTestId('profile-popover-backdrop'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('stays a viewport overlay inside the mobile shell', () => {
    renderProfile();
    expect(screen.getByTestId('profile-popover-backdrop')).toHaveClass('fixed', 'z-[100]', 'items-center', 'justify-center');
    expect(readFileSync(join(process.cwd(), 'src/app/app/mobile/mobile-shell.css'), 'utf8'))
      .toContain('.obelisk-mobile > :not(.fixed)');
  });

  it('does not close from panel content', () => {
    const onClose = vi.fn();
    renderProfile(onClose);
    fireEvent.click(screen.getByTestId('profile-popover'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens the full feed only from Explore profile', () => {
    const onClose = vi.fn();
    const onExplore = vi.fn();
    renderProfile(onClose, onExplore);
    fireEvent.click(screen.getByTestId('profile-explore-btn'));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onExplore).toHaveBeenCalledWith(PUBKEY);
  });

  it('anchors beside the clicked user and opens messages internally', () => {
    const onClose = vi.fn();
    const onMessage = vi.fn();
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(300);
    const width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(384);
    useChatStore.getState().openProfilePopup(PUBKEY, { x: 100, y: 700 });
    renderProfile(onClose, vi.fn(), onMessage);

    expect(screen.getByTestId('profile-popover')).toHaveStyle({ left: '112px', top: '392px' });
    fireEvent.click(screen.getByTestId('profile-message-btn'));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onMessage).toHaveBeenCalledWith(PUBKEY);
    height.mockRestore();
    width.mockRestore();
  });

  it('shows the npub ending with a copy icon instead of an njump link', () => {
    renderProfile();
    expect(screen.getByTestId('profile-copy-npub-btn')).toHaveTextContent('npub1aaaaaaa…aaaaaa');
    expect(screen.getByTestId('profile-handle')).toContainElement(screen.getByTestId('profile-copy-npub-btn'));
    expect(screen.getByTestId('profile-popover')).not.toHaveClass('overflow-y-auto');
    expect(screen.queryByTestId('profile-open-nostr-btn')).not.toBeInTheDocument();
    expect(screen.getByTestId('profile-name-row')).toContainElement(screen.getByTestId('profile-zap-btn'));
    // Mute / block live in the ⋯ menu now, not as a second row of buttons.
    expect(screen.queryByTestId('profile-mute-btn')).toBeNull();
    fireEvent.click(screen.getByTestId('profile-more-button'));
    expect(screen.getByTestId('profile-menu-mute')).toBeInTheDocument();
    expect(screen.getByTestId('profile-menu-block')).toBeInTheDocument();
  });

  it('my own card offers Edit profile and Preferences, and no zap', async () => {
    me.pubkey = PUBKEY;
    const { OPEN_SETTINGS_EVENT } = await import('@/lib/open-settings');
    const seen: string[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent).detail.section);
    window.addEventListener(OPEN_SETTINGS_EVENT, listener);
    const onClose = vi.fn();
    renderProfile(onClose);
    expect(screen.queryByTestId('profile-zap-btn')).toBeNull();
    fireEvent.click(screen.getByTestId('profile-edit-btn'));
    fireEvent.click(screen.getByTestId('profile-preferences-btn'));
    expect(seen).toEqual(['profile', 'general']);
    expect(onClose).toHaveBeenCalledTimes(2);
    window.removeEventListener(OPEN_SETTINGS_EVENT, listener);
  });

  it('the ⋯ trigger is an SVG icon button and its menu rows carry icons', () => {
    renderProfile();
    const trigger = screen.getByTestId('profile-more-button');
    expect(trigger.textContent).not.toContain('⋯');
    expect(trigger.querySelector('svg')).not.toBeNull();
    fireEvent.click(trigger);
    for (const id of ['profile-menu-share', 'profile-menu-copy-link', 'profile-menu-copy-npub', 'profile-menu-copy-hex', 'profile-menu-mute', 'profile-menu-block']) {
      expect(screen.getByTestId(id).querySelector('svg')).not.toBeNull();
    }
    expect(screen.getByTestId('profile-more-menu').className).toContain('p-1.5');
  });
});
