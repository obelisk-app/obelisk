import { useChatStore } from '@/store/chat';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { usePhoneShell } from '@/hooks/shell/mobile/nav/usePhoneShell';

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

const run = (seed: Parameters<typeof fakeBridge>[0] = {}) =>
  renderHook(() => usePhoneShell(), { wrapper: bridgeWrapper(fakeBridge(seed, { setActiveGroup: vi.fn(), setActiveDmPeer: vi.fn() } as never)) });

describe('usePhoneShell', () => {
  it('reports a guest so the shell shows the login', () => {
    const { result } = run({ isLoggedIn: false });
    expect(result.current.isLoggedIn).toBe(false);
  });

  it('opens on the server tab with the nav shown and its hint surface', () => {
    const { result } = run();
    expect(result.current.nav.screen).toBe('server');
    expect(result.current.hideNav).toBe(false);
    expect(result.current.hintSurface).toBe('server');
    expect(result.current.kbStyle).toBeUndefined();
    expect(result.current.dmBadge).toBe(0);
  });

  it('hands every screen the shell actions and hides the nav on a full-screen one', () => {
    const { result } = run();
    act(() => result.current.screenProps.go('search'));
    expect(result.current.nav.screen).toBe('search');
    expect(result.current.hideNav).toBe(true);
    expect(result.current.hintSurface).toBeNull();
  });

  it('opens the channel chat from a voice room', () => {
    const { result } = run();
    act(() => result.current.screenProps.openVoiceChat());
    expect(result.current.nav.screen).toBe('channel');
  });
});

it('opens the notification transcript and retains its exact message for the viewport', async () => {
  useChatStore.getState().reset();
  const relay = 'wss://target.test';
  const fake = fakeBridge({ configuredRelays: [relay], groups: [groupFixture({ id: 'voice-room', kind: 'voice' })] }, {
    setActiveGroup: vi.fn(), ensureGroupMessage: vi.fn().mockResolvedValue(true),
    switchRelay: vi.fn(async (url: string) => { fake.stores.currentRelayUrl.set(url); }),
  });
  const { result } = renderHook(() => usePhoneShell(), { wrapper: bridgeWrapper(fake) });
  act(() => useChatStore.getState().requestMentionJump({ relay, channelId: 'voice-room', id: 'old-message' }));
  await waitFor(() => expect(result.current.nav.screen).toBe('channel'));
  expect(result.current.nav.groupId).toBe('voice-room');
  expect(useChatStore.getState().pendingJump).toEqual({ groupId: 'voice-room', messageId: 'old-message' });
  useChatStore.getState().reset();
});
