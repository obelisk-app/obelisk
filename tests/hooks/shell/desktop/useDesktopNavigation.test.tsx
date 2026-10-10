import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesktopNavigation } from '@/hooks/shell/desktop/useDesktopNavigation';
import { useCurrentRelayUrl } from '@/services/nostr-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { initialNav } from '@/constants/shell/mobile';
import { navForView, viewForNav } from '@/utils/shell/desktop/navigation';
import { parseUrl } from '@/utils/shell/mobile/url-state';
import { requestVoiceJump } from '@/services/voice/jump-to-voice';

function mount() {
  return renderHook(() => useDesktopNavigation('wss://relay.example'), {
    wrapper: bridgeWrapper(fakeBridge({}, { setActiveGroup: vi.fn(), switchRelay: vi.fn() })),
  });
}
beforeEach(() => window.history.replaceState(null, '', '/app'));
afterEach(cleanup);

describe('responsive destination handoff', () => {
  it.each([
    ['?s=dm-thread&p=peer', { kind: 'dm', peer: 'peer' }],
    ['?s=dms-list', { kind: 'dm', peer: null }],
    ['?s=feed', { kind: 'feed' }],
    ['?s=feed&c=room', { kind: 'group', groupId: 'room' }],
    ['?s=voice-room&c=room', { kind: 'group', groupId: 'room' }],
    ['?s=forum&c=forum', { kind: 'group', groupId: 'forum' }],
  ] as const)('restores %s on desktop', (search, expected) => {
    window.history.replaceState(null, '', `/es/app${search}`);
    expect(mount().result.current.view).toEqual(expected);
    expect(window.location.pathname).toBe('/es/app');
  });

  it('pushes deliberate destinations, but does not push again on popstate or message normalization', () => {
    const { result } = mount();
    const push = vi.spyOn(window.history, 'pushState');
    act(() => result.current.setView({ kind: 'dm', peer: 'alice' }));
    act(() => result.current.setView({ kind: 'dm', peer: 'bob' }));
    expect(push).toHaveBeenCalledTimes(2);
    act(() => result.current.setView({ kind: 'dm', peer: 'bob' }));
    expect(push).toHaveBeenCalledTimes(2);
    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: { nav: navForView({ kind: 'dm', peer: 'alice' }) } })));
    expect(result.current.view).toEqual({ kind: 'dm', peer: 'alice' });
    expect(push).toHaveBeenCalledTimes(2);
    act(() => result.current.setPendingMessageId(null));
    expect(push).toHaveBeenCalledTimes(2);
    push.mockRestore();
  });

  it('restores the historical relay before selecting its channel or rewriting its URL', async () => {
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const setActiveGroup = vi.fn();
    const switchRelay = vi.fn(async (url: string) => { await gate; fake.stores.currentRelayUrl.set(url); });
    const fake = fakeBridge({ currentRelayUrl: 'wss://b.example', configuredRelays: ['wss://a.example', 'wss://b.example'] }, { setActiveGroup, switchRelay });
    const { result } = renderHook(() => useDesktopNavigation(useCurrentRelayUrl()), { wrapper: bridgeWrapper(fake) });
    act(() => result.current.setView({ kind: 'group', groupId: 'b-room' }));
    const nav = navForView({ kind: 'group', groupId: 'a-room' });
    const push = vi.spyOn(window.history, 'pushState');
    act(() => {
      window.history.replaceState({ nav }, '', '/app?relay=a.example&c=a-room');
      window.dispatchEvent(new PopStateEvent('popstate', { state: { nav } }));
    });
    await waitFor(() => expect(switchRelay).toHaveBeenCalledWith('wss://a.example'));
    expect(result.current.view).toEqual({ kind: 'empty' });
    expect(setActiveGroup).not.toHaveBeenCalledWith('a-room');
    expect(window.location.search).toContain('relay=a.example');
    await act(async () => { finish(); await gate; });
    await waitFor(() => expect(result.current.view).toEqual({ kind: 'group', groupId: 'a-room' }));
    expect(setActiveGroup).toHaveBeenLastCalledWith('a-room');
    expect(window.location.search).toContain('relay=a.example');
    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });

  it('keeps an inherited phone-only destination until desktop navigation clears stale fields', () => {
    const nav = { ...initialNav, screen: 'profile-view' as const, profilePubkey: 'author', groupId: 'room', parentScreen: 'channel' as const };
    window.history.replaceState({ nav, phoneHistory: true, custom: 'retained' }, '', '/pt/app?s=profile-view&u=author&c=room');
    const { result } = mount();
    expect(result.current.view).toEqual({ kind: 'group', groupId: 'room' });
    expect(window.history.state.nav).toEqual(nav);
    act(() => result.current.setView({ kind: 'dm', peer: 'other' }));
    expect(parseUrl(window.location.search).nav).toEqual(navForView({ kind: 'dm', peer: 'other' }));
    expect(window.location.search).not.toMatch(/[?&](c|u|pr|f|m)=/);
    expect(window.history.state).toMatchObject({ phoneHistory: true, custom: 'retained' });
  });

  it('replays existing phone history in both directions while desktop is mounted', () => {
    const { result } = mount();
    for (const nav of [navForView({ kind: 'dm', peer: 'alice' }), navForView({ kind: 'feed' })]) {
      act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: { nav, phoneHistory: true } })));
      expect(result.current.view).toEqual(viewForNav(nav));
      expect(parseUrl(window.location.search).nav).toEqual(nav);
    }
  });

  it('skips the phone exit sentinel instead of leaving the desktop on its URL', () => {
    mount();
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: { guard: true, phoneHistory: true } })));
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it('does not carry a message deep link into a different channel', () => {
    window.history.replaceState(null, '', '/app?c=old&m=message');
    const { result } = mount();
    expect(new URLSearchParams(window.location.search).get('m')).toBe('message');
    act(() => result.current.setView({ kind: 'group', groupId: 'new' }));
    expect(new URLSearchParams(window.location.search).has('m')).toBe(false);
  });

  it('still jumps from the voice status bar to its channel', () => {
    const { result } = mount();
    act(() => requestVoiceJump({ channelId: 'voice-room', relayUrl: 'wss://relay.example' }));
    expect(result.current.view).toEqual({ kind: 'group', groupId: 'voice-room' });
  });

  it('uses a safe parent for phone-only screens that have no desktop view', () => {
    expect(viewForNav({ ...initialNav, screen: 'settings-prefs' })).toEqual({ kind: 'empty' });
    expect(viewForNav({ ...initialNav, screen: 'profile-view', parentScreen: 'feed' })).toEqual({ kind: 'feed' });
  });
});
