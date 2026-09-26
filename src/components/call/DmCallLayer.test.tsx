import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/social/useAuthor', () => ({
  useAuthor: () => ({ name: 'Bob', displayName: 'Bob', picture: null, nip05: null, about: null, banner: null, lud16: null }),
}));
vi.mock('@/lib/nostr-bridge', async (orig) => ({
  ...(await orig<typeof import('@/lib/nostr-bridge')>()),
  useIsLoggedIn: () => false,
}));

import { DmCallLayer } from './DmCallLayer';
import { DmCallButtons } from './DmCallButtons';
import { LocaleProvider } from '@/i18n/context';
import { useDmCallStore } from '@/store/dm-call';
import { setPreference } from '@/lib/preferences';

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
