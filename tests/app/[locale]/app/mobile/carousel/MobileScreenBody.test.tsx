import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { NavState } from '@/utils/shell/mobile/url-state';
import { initialNav } from '@/constants/shell/mobile';
import { MobileScreenBody } from '@/app/[locale]/app/mobile/carousel/MobileScreenBody';
import { TopLevelScreen } from '@/app/[locale]/app/mobile/carousel/TopLevelScreen';
import type { MobileScreenProps } from '@/hooks/shell/mobile/nav/usePhoneShell';

const { stub, counts } = vi.hoisted(() => ({ counts: { feed: 0 }, stub: (name: string) => (p: Record<string, unknown>) => (
  <div data-testid={name} data-props={JSON.stringify(Object.fromEntries(Object.entries(p).filter(([, v]) => typeof v !== 'function')))}>
    {Object.entries(p).filter(([, v]) => typeof v === 'function').map(([k, v]) => (
      <button key={k} data-testid={`${name}:${k}`} onClick={() => (v as (...a: unknown[]) => void)('arg')} />
    ))}
  </div>
) }));
vi.mock('@/components/social/FeedScreen', async () => {
  const { memo } = await import('react');
  const Feed = stub('feed');
  return { default: memo((props: Record<string, unknown>) => { counts.feed += 1; return <Feed {...props} />; }) };
});
vi.mock('@/app/[locale]/app/mobile/screens/channel/ChannelScreen', () => ({ ChannelScreen: stub('channel') }));
vi.mock('@/app/[locale]/app/mobile/screens/channel/MemberListScreen', () => ({ MemberListScreen: stub('members') }));
vi.mock('@/app/[locale]/app/mobile/screens/dm/ComposeDmScreen', () => ({ ComposeDmScreen: stub('compose') }));
vi.mock('@/app/[locale]/app/mobile/screens/dm/DmThreadScreen', () => ({ DmThreadScreen: stub('thread') }));
vi.mock('@/app/[locale]/app/mobile/screens/dm/DmsListScreen', () => ({ DmsListScreen: stub('dms') }));
vi.mock('@/app/[locale]/app/mobile/screens/dm/MobileDmOptInScreen', () => ({ MobileDmOptInScreen: stub('optin') }));
vi.mock('@/app/[locale]/app/mobile/screens/profile/EditProfileScreen', () => ({ EditProfileScreen: stub('edit') }));
vi.mock('@/components/chat/profile/NostrProfile', () => ({ default: stub('profile') }));
vi.mock('@/app/[locale]/app/mobile/screens/forum/ForumScreen', () => ({ ForumScreen: stub('forum') }));
vi.mock('@/app/[locale]/app/mobile/screens/inbox/InboxScreen', () => ({ InboxScreen: stub('inbox') }));
vi.mock('@/app/[locale]/app/mobile/screens/search/SearchScreen', () => ({ SearchScreen: stub('search') }));
vi.mock('@/app/[locale]/app/mobile/screens/server/ServerScreen', () => ({ ServerScreen: stub('server') }));
vi.mock('@/app/[locale]/app/mobile/screens/settings/SettingsPrefsScreen', () => ({ SettingsPrefsScreen: stub('prefs') }));
vi.mock('@/app/[locale]/app/mobile/screens/settings/SettingsProfileScreen', () => ({ SettingsProfileScreen: stub('you') }));
vi.mock('@/app/[locale]/app/mobile/screens/status/EmptyScreen', () => ({ EmptyScreen: stub('empty') }));
vi.mock('@/app/[locale]/app/mobile/screens/voice/VoiceRoomScreen', () => ({ VoiceRoomScreen: stub('voice') }));

function props(dmOptInEnabled = true) {
  const p = {
    t: (k: string) => k, dmOptInEnabled, myFollows: ['f'],
    go: vi.fn(), selectGroup: vi.fn(), selectPeer: vi.fn(), exploreProfile: vi.fn(), openProfile: vi.fn(),
    openMembers: vi.fn(), openMsgActions: vi.fn(), openZap: vi.fn(), openVoiceChat: vi.fn(), backFromChannel: vi.fn(), backFromProfile: vi.fn(),
  };
  return p as typeof p & MobileScreenProps;
}
const nav = (over: Partial<NavState>): NavState => ({ ...initialNav, ...over });
function body(n: Partial<NavState>, p = props()) {
  last = render(<MobileScreenBody nav={nav(n)} p={p} />);
  return last;
}
function top(s: NavState['screen'], p = props()) {
  last = render(<TopLevelScreen screen={s} p={p} />);
  return last;
}
let last: ReturnType<typeof render> | null = null;
const shown = () => last?.container.firstElementChild?.getAttribute('data-testid') ?? null;
const dataOf = (id: string) => JSON.parse(screen.getByTestId(id).getAttribute('data-props')!);

describe('the phone screen table', () => {
  it('mounts each top-level tab, the DM opt-in in place of DMs when they are off, nothing for a sub-screen', () => {
    for (const [s, id] of [['server', 'server'], ['feed', 'feed'], ['inbox', 'inbox'], ['settings-profile', 'you'], ['dms-list', 'dms']] as const) {
      const { unmount } = top(s);
      expect(shown()).toBe(id);
      unmount();
    }
    const off = top('dms-list', props(false));
    expect(shown()).toBe('optin');
    off.unmount();
    const sub = top('channel');
    expect(shown()).toBeNull();
    sub.unmount();
  });

  it('keeps the profile callback stable across unrelated shell renders', () => {
    const p = props();
    const view = top('feed', p);
    const before = counts.feed;
    view.rerender(<TopLevelScreen screen="feed" p={{ ...p }} />);
    expect(counts.feed).toBe(before);
  });

  it('opens the feed profile with exploreProfile', () => {
    const p = props();
    top('feed', p);
    fireEvent.click(screen.getByTestId('feed:onOpenProfile'));
    expect(p.exploreProfile).toHaveBeenCalledWith('arg');
  });

  it('mounts the sub-screen for its target, or the empty screen without one', async () => {
    const cases: Array<[Partial<NavState>, string]> = [
      [{ screen: 'channel', groupId: 'g' }, 'channel'],
      [{ screen: 'channel' }, 'empty'],
      [{ screen: 'voice-room', groupId: 'g' }, 'voice'],
      [{ screen: 'voice-room' }, 'empty'],
      [{ screen: 'dm-thread', dmPeer: 'p' }, 'thread'],
      [{ screen: 'dm-thread' }, 'empty'],
      [{ screen: 'profile-view', profilePubkey: 'k' }, 'profile'],
      [{ screen: 'profile-view' }, 'empty'],
      [{ screen: 'member-list', groupId: 'g' }, 'members'],
      [{ screen: 'member-list' }, 'empty'],
      [{ screen: 'forum', groupId: 'g' }, 'forum'],
      [{ screen: 'forum' }, 'empty'],
      [{ screen: 'compose-dm' }, 'compose'],
      [{ screen: 'search' }, 'search'],
      [{ screen: 'settings-prefs' }, 'prefs'],
      [{ screen: 'profile-edit' }, 'edit'],
      [{ screen: 'inbox' }, 'inbox'],
      [{ screen: 'login' }, 'empty'],
    ];
    for (const [n, id] of cases) {
      const { unmount } = body(n);
      if (id === 'prefs') await screen.findByTestId(id);
      expect([n.screen, shown()]).toEqual([n.screen, id]);
      unmount();
    }
  });

  it('swaps the DM screens for the opt-in when DMs are off', () => {
    for (const screenName of ['dm-thread', 'compose-dm', 'dms-list'] as const) {
      const { unmount } = body({ screen: screenName, dmPeer: 'p' }, props(false));
      expect(shown()).toBe('optin');
      unmount();
    }
  });

  it('keeps the base screen under the message sheet, and nothing when it has none', () => {
    const cases: Array<[Partial<NavState>, string | null]> = [
      [{ screen: 'msg-actions', groupId: 'g' }, 'channel'],
      [{ screen: 'msg-actions', baseScreen: 'channel', groupId: 'g' }, 'channel'],
      [{ screen: 'msg-actions', baseScreen: 'dm-thread', dmPeer: 'p' }, 'thread'],
      [{ screen: 'msg-actions', baseScreen: 'dm-thread' }, null],
      [{ screen: 'msg-actions', baseScreen: 'channel' }, null],
      [{ screen: 'msg-actions', baseScreen: 'inbox', groupId: 'g' }, null],
    ];
    for (const [n, id] of cases) {
      const { unmount } = body(n);
      expect([JSON.stringify(n), shown()]).toEqual([JSON.stringify(n), id]);
      unmount();
    }
  });

  it('wires each screen to the shell actions', () => {
    const p = props();
    const { unmount } = body({ screen: 'forum', groupId: 'g' }, p);
    fireEvent.click(screen.getByTestId('forum:selectChild'));
    expect(p.selectGroup).toHaveBeenCalledWith('arg', 'text');
    fireEvent.click(screen.getByTestId('forum:back'));
    expect(p.go).toHaveBeenCalledWith('server', 'back');
    unmount();
    body({ screen: 'voice-room', groupId: 'g' }, p);
    fireEvent.click(screen.getByTestId('voice:openChat'));
    expect(p.openVoiceChat).toHaveBeenCalled();
    expect(dataOf('voice')).toEqual({ groupId: 'g' });
  });

  it('goes back through the browser history from the member list', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    body({ screen: 'member-list', groupId: 'g' });
    fireEvent.click(screen.getByTestId('members:back'));
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it('titles the empty screen for what is missing', () => {
    body({ screen: 'channel' });
    expect(dataOf('empty')).toEqual({ title: 'mobile.empty.noChannelSelected' });
  });
});
