import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/social/useAuthor', () => ({
  useAuthor: () => ({ name: 'Bob', displayName: 'Bob', picture: null, nip05: null, about: null, banner: null, lud16: null }),
}));
vi.mock('@/services/nostr-bridge', async (orig) => {
  const { bridgeOverrides } = await import('@tests/support/mocks/nostr-bridge');
  return { ...(await orig<typeof import('@/services/nostr-bridge')>()), ...bridgeOverrides({ useIsLoggedIn: () => false }) };
});

import { DmCallLayer } from '@/components/call/DmCallLayer';
import { DmCallButtons } from '@/components/call/DmCallButtons';
import { LocaleProvider } from '@/i18n/context';
import { useDmCallStore } from '@/store/dm-call';
import { setPreference } from '@/services/preferences';

const BOB = 'b'.repeat(64);
const renderLocalized = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);
const media = { micOn: true, cameraOn: false, screenOn: false, localVideo: null, localScreen: null, remoteAudio: null, remoteVideo: null, remoteScreen: null };

describe('DM call UI', () => {
  const actions = {
    acceptCall: vi.fn(async () => {}),
    declineCall: vi.fn(),
    hangup: vi.fn(),
    setMic: vi.fn(),
    setCamera: vi.fn(async () => {}),
    startCall: vi.fn(async () => {}),
    dismiss: vi.fn(),
  };
  beforeEach(() => {
    useDmCallStore.setState({ status: 'idle', peer: null, video: false, relayOnly: false, media, connectedAt: null, endReason: null, error: null, ...actions });
  });
  afterEach(() => vi.clearAllMocks());

  it('shows the incoming banner with accept, accept-with-video and decline', () => {
    useDmCallStore.setState({ status: 'incoming', peer: BOB, video: true });
    renderLocalized(<DmCallLayer />);
    expect(screen.getByTestId('dm-incoming-call')).toHaveTextContent('Bob');
    expect(screen.getByTestId('dm-incoming-call')).toHaveTextContent('Incoming video call');
    fireEvent.click(screen.getByTestId('dm-call-accept-video'));
    expect(actions.acceptCall).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByTestId('dm-call-accept'));
    expect(actions.acceptCall).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByTestId('dm-call-decline'));
    expect(actions.declineCall).toHaveBeenCalled();
    expect(screen.queryByTestId('dm-call-view')).toBeNull();
  });

  it('a voice-only invite offers no video accept', () => {
    useDmCallStore.setState({ status: 'incoming', peer: BOB, video: false });
    renderLocalized(<DmCallLayer />);
    expect(screen.queryByTestId('dm-call-accept-video')).toBeNull();
  });

  it('the call view shows state, the relay badge, and wires the controls', () => {
    useDmCallStore.setState({ status: 'outgoing', peer: BOB, relayOnly: true });
    renderLocalized(<DmCallLayer />);
    expect(screen.getByTestId('dm-call-view')).toHaveTextContent('Calling…');
    expect(screen.getByTestId('dm-call-encrypted')).toBeInTheDocument();
    expect(screen.getByTestId('dm-call-ip-hidden')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('dm-call-mic'));
    expect(actions.setMic).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByTestId('dm-call-camera'));
    expect(actions.setCamera).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByTestId('dm-call-hangup'));
    expect(actions.hangup).toHaveBeenCalled();
  });

  it('toggles fullscreen with the button and double-click, falling back to filling the window', async () => {
    useDmCallStore.setState({ status: 'active', peer: BOB, connectedAt: Date.now() });
    renderLocalized(<DmCallLayer />);
    const view = screen.getByTestId('dm-call-view');
    // jsdom has no Fullscreen API: the fallback path.
    expect(view).not.toHaveAttribute('data-fullscreen');
    fireEvent.click(screen.getByTestId('dm-call-fullscreen'));
    expect(view).toHaveAttribute('data-fullscreen', 'true');
    expect(screen.getByTestId('dm-call-fullscreen')).toHaveAttribute('aria-label', 'Exit full screen');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(view).not.toHaveAttribute('data-fullscreen');
    fireEvent.doubleClick(view.firstElementChild!);
    expect(view).toHaveAttribute('data-fullscreen', 'true');
  });

  it('uses the Fullscreen API when the browser has it', async () => {
    const requestFullscreen = vi.fn(function (this: HTMLElement) {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => this });
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    });
    (HTMLElement.prototype as unknown as { requestFullscreen: unknown }).requestFullscreen = requestFullscreen;
    try {
      useDmCallStore.setState({ status: 'active', peer: BOB, connectedAt: Date.now() });
      renderLocalized(<DmCallLayer />);
      fireEvent.click(screen.getByTestId('dm-call-fullscreen'));
      expect(requestFullscreen).toHaveBeenCalled();
      await Promise.resolve();
      expect(screen.getByTestId('dm-call-view')).toHaveAttribute('data-fullscreen', 'true');
    } finally {
      delete (HTMLElement.prototype as unknown as { requestFullscreen?: unknown }).requestFullscreen;
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
    }
  });

  it('shows why a call ended, with a close button', () => {
    useDmCallStore.setState({ status: 'ended', peer: BOB, endReason: 'declined' });
    renderLocalized(<DmCallLayer />);
    expect(screen.getByTestId('dm-call-view')).toHaveTextContent('Call declined');
    fireEvent.click(screen.getByTestId('dm-call-close'));
    expect(actions.dismiss).toHaveBeenCalled();
  });

  it('call buttons start voice / video calls, and are disabled with DMs off', () => {
    setPreference('directMessagesEnabled', true);
    const { unmount } = renderLocalized(<DmCallButtons peer={BOB} />);
    fireEvent.click(screen.getByTestId('dm-call-video'));
    expect(actions.startCall).toHaveBeenCalledWith(BOB, true);
    fireEvent.click(screen.getByTestId('dm-call-voice'));
    expect(actions.startCall).toHaveBeenCalledWith(BOB, false);
    unmount();
    setPreference('directMessagesEnabled', false);
    renderLocalized(<DmCallButtons peer={BOB} />);
    expect(screen.getByTestId('dm-call-voice')).toBeDisabled();
    expect(screen.getByTestId('dm-call-voice')).toHaveAttribute('title', 'Turn on direct messages to make calls');
  });
});
