import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import VoiceStatusBar from '@/components/voice/status-bar/VoiceStatusBar';
import { useVoiceStore } from '@/store/voice';
import { LocaleProvider } from '@tests/support/intl';

type FakeClient = {
  setMicEnabled: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
  setDeafenEnabled?: ReturnType<typeof vi.fn>;
  setCameraEnabled?: ReturnType<typeof vi.fn>;
  setScreenShareEnabled?: ReturnType<typeof vi.fn>;
  switchCamera?: ReturnType<typeof vi.fn>;
};
const harness = vi.hoisted(() => ({
  client: null as FakeClient | null,
  setActiveVoiceClient: vi.fn(),
  jump: vi.fn(),
}));

vi.mock('@/services/nostr-bridge', () => ({
  useGroups: () => [{ id: 'ch1', name: 'Lounge' }],
}));
vi.mock('@/services/voice/active-client', () => ({
  getActiveVoiceClient: () => harness.client,
  setActiveVoiceClient: harness.setActiveVoiceClient,
}));
vi.mock('@/services/voice/jump-to-voice', () => ({ requestVoiceJump: (req: unknown) => harness.jump(req) }));

const renderBar = () => render(
  <LocaleProvider initialLocale="en"><VoiceStatusBar /></LocaleProvider>,
);

beforeEach(() => {
  harness.client = null;
  harness.setActiveVoiceClient.mockClear();
  harness.jump.mockClear();
  useVoiceStore.setState({ currentVoiceChannelId: 'ch1', isSignalingDegraded: false, error: null });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useVoiceStore.getState().leaveVoice();
});

describe('VoiceStatusBar', () => {
  it('says why the switch-camera button is missing when device enumeration fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const nav = globalThis.navigator as unknown as { mediaDevices?: unknown };
    const prev = nav.mediaDevices;
    nav.mediaDevices = { enumerateDevices: async () => { throw new Error('devices blocked'); } };
    try {
      useVoiceStore.setState({ isCameraOn: true });
      renderBar();
      await waitFor(() => expect(warn).toHaveBeenCalledWith(
        '[voice] enumerateDevices failed; the switch-camera button stays hidden', expect.any(Error),
      ));
      expect(screen.queryByTestId('voice-bar-switch-camera')).toBeNull();
    } finally {
      nav.mediaDevices = prev;
    }
  });

  it('shows "Voice connected" while signaling is healthy', () => {
    renderBar();
    expect(screen.getByText('Voice connected')).toBeTruthy();
    expect(screen.queryByTestId('voice-bar-reconnecting')).toBeNull();
  });

  it('says it is reconnecting while a voice subscription is rate-limited', () => {
    useVoiceStore.setState({ isSignalingDegraded: true });
    renderBar();
    expect(screen.getByTestId('voice-bar-reconnecting').textContent).toBe('Reconnecting to voice…');
    expect(screen.queryByText('Voice connected')).toBeNull();
  });

  it('surfaces a microphone failure in the store instead of swallowing it', async () => {
    harness.client = {
      setMicEnabled: vi.fn(async () => { throw new Error('Permission denied'); }),
      leave: vi.fn(async () => {}),
    };
    renderBar();
    const muted = useVoiceStore.getState().isMuted;
    fireEvent.click(screen.getByTitle(muted ? 'Unmute' : 'Mute'));
    await waitFor(() => expect(useVoiceStore.getState().error).toBe('mic'));
  });

  it('renders nothing without a current call', () => {
    useVoiceStore.setState({ currentVoiceChannelId: null });
    const { container } = renderBar();
    expect(container.querySelector('[data-testid="voice-status-bar"]')).toBeNull();
  });

  it('deafen silences playback, mirrors the store and mutes the open microphone', () => {
    const client: FakeClient = {
      setMicEnabled: vi.fn(async () => {}), leave: vi.fn(async () => {}), setDeafenEnabled: vi.fn(),
    };
    harness.client = client;
    useVoiceStore.setState({ isMuted: false, isDeafened: false });
    renderBar();
    fireEvent.click(screen.getByTitle('Deafen'));
    expect(client.setDeafenEnabled).toHaveBeenCalledWith(true);
    expect(useVoiceStore.getState().isDeafened).toBe(true);
    expect(client.setMicEnabled).toHaveBeenCalledWith(false);
  });

  it('a camera the user declined is not an error; any other camera failure is', async () => {
    const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    const client: FakeClient = {
      setMicEnabled: vi.fn(async () => {}), leave: vi.fn(async () => {}),
      setCameraEnabled: vi.fn(async () => { throw denied; }),
      setScreenShareEnabled: vi.fn(async () => { throw new Error('No screen'); }),
    };
    harness.client = client;
    renderBar();
    fireEvent.click(screen.getByTestId('voice-bar-camera'));
    await waitFor(() => expect(client.setCameraEnabled).toHaveBeenCalledWith(true));
    expect(useVoiceStore.getState().error).toBeNull();
    fireEvent.click(screen.getByTestId('voice-bar-screenshare'));
    await waitFor(() => expect(useVoiceStore.getState().error).toBe('screen'));
  });

  it('offers the camera flip only with the camera on and two cameras, and surfaces a flip failure', async () => {
    const nav = globalThis.navigator as unknown as { mediaDevices?: unknown };
    const prev = nav.mediaDevices;
    nav.mediaDevices = { enumerateDevices: async () => [{ kind: 'videoinput' }, { kind: 'videoinput' }] };
    const client: FakeClient = {
      setMicEnabled: vi.fn(async () => {}), leave: vi.fn(async () => {}),
      switchCamera: vi.fn(async () => { throw new Error('flip failed'); }),
    };
    harness.client = client;
    try {
      useVoiceStore.setState({ isCameraOn: true });
      renderBar();
      const flip = await screen.findByTestId('voice-bar-switch-camera');
      fireEvent.click(flip);
      await waitFor(() => expect(useVoiceStore.getState().error).toBe('switchCamera'));
    } finally {
      nav.mediaDevices = prev;
    }
  });

  it('jumping back to the call carries the relay the call was joined on', () => {
    useVoiceStore.setState({ currentVoiceRelayUrl: 'wss://home.relay' });
    renderBar();
    fireEvent.click(screen.getByTitle('Go to voice channel'));
    expect(harness.jump).toHaveBeenCalledWith({ channelId: 'ch1', relayUrl: 'wss://home.relay' });
  });

  it('drops the call locally and reports it when leave() rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    harness.client = {
      setMicEnabled: vi.fn(async () => {}),
      leave: vi.fn(async () => { throw new Error('relay hung'); }),
    };
    renderBar();
    fireEvent.click(screen.getByTestId('voice-bar-leave'));
    await waitFor(() => expect(useVoiceStore.getState().currentVoiceChannelId).toBeNull());
    expect(harness.setActiveVoiceClient).toHaveBeenCalledWith(null);
    expect(warn).toHaveBeenCalledWith('[voice] leave failed; the call was dropped locally anyway', expect.any(Error));
  });
});

describe('VoiceStatusBar details', () => {
  const SMALL = 'flex-1 h-8 rounded-md flex items-center justify-center transition-colors ';

  it('names the channel, or shows the first eight characters of an unknown id', () => {
    const { unmount } = renderBar();
    expect(screen.getByText('Lounge')).toBeTruthy();
    unmount();
    useVoiceStore.setState({ currentVoiceChannelId: 'abcdef0123456789' });
    renderBar();
    expect(screen.getByText('abcdef01…')).toBeTruthy();
  });

  it('keeps the look of each small button for its state', () => {
    useVoiceStore.setState({ isMuted: true, isDeafened: false, isCameraOn: true, isScreenSharing: false });
    renderBar();
    expect(screen.getByTitle('Unmute')).toHaveClass(SMALL + 'bg-red-600/20 text-red-400 hover:bg-red-600/30');
    expect(screen.getByTitle('Deafen')).toHaveClass(SMALL + 'bg-lc-green/20 text-lc-green hover:bg-lc-green/30');
    expect(screen.getByTestId('voice-bar-camera')).toHaveClass(SMALL + 'bg-lc-green/20 text-lc-green hover:bg-lc-green/30');
    expect(screen.getByTestId('voice-bar-screenshare')).toHaveClass(SMALL + 'bg-lc-border/40 hover:bg-lc-border/60 text-lc-muted hover:text-lc-white');
    expect(screen.getByTestId('voice-bar-camera').title).toBe('Turn off camera');
    expect(screen.getByTestId('voice-bar-screenshare').title).toBe('Share screen');
  });

  it('undeafening, or deafening while muted, leaves the microphone alone', () => {
    const client: FakeClient = {
      setMicEnabled: vi.fn(async () => {}), leave: vi.fn(async () => {}), setDeafenEnabled: vi.fn(),
    };
    harness.client = client;
    useVoiceStore.setState({ isMuted: true, isDeafened: false });
    const { unmount } = renderBar();
    fireEvent.click(screen.getByTitle('Deafen'));
    expect(client.setDeafenEnabled).toHaveBeenCalledWith(true);
    expect(client.setMicEnabled).not.toHaveBeenCalled();
    unmount();
    useVoiceStore.setState({ isMuted: false, isDeafened: true });
    renderBar();
    fireEvent.click(screen.getByTitle('Undeafen'));
    expect(client.setDeafenEnabled).toHaveBeenLastCalledWith(false);
    expect(useVoiceStore.getState().isDeafened).toBe(false);
    expect(client.setMicEnabled).not.toHaveBeenCalled();
  });

  it('does nothing on the toggles without an active client', () => {
    useVoiceStore.setState({ isMuted: false, isDeafened: false });
    renderBar();
    fireEvent.click(screen.getByTitle('Deafen'));
    expect(useVoiceStore.getState().isDeafened).toBe(false);
  });

  it('leaving without an active client still drops the call locally', async () => {
    renderBar();
    fireEvent.click(screen.getByTestId('voice-bar-leave'));
    await waitFor(() => expect(useVoiceStore.getState().currentVoiceChannelId).toBeNull());
    expect(harness.setActiveVoiceClient).toHaveBeenCalledWith(null);
  });

  it('jumping back without a home relay passes null', () => {
    useVoiceStore.setState({ currentVoiceRelayUrl: null });
    renderBar();
    fireEvent.click(screen.getByTitle('Go to voice channel'));
    expect(harness.jump).toHaveBeenCalledWith({ channelId: 'ch1', relayUrl: null });
  });

  it('checks the cameras again when a device is plugged in, and stops listening on unmount', async () => {
    const nav = globalThis.navigator as unknown as { mediaDevices?: unknown };
    const prev = nav.mediaDevices;
    let cams = [{ kind: 'videoinput' }];
    let onChange: (() => void) | null = null;
    const removeEventListener = vi.fn();
    nav.mediaDevices = {
      enumerateDevices: async () => cams,
      addEventListener: (_: string, cb: () => void) => { onChange = cb; },
      removeEventListener,
    };
    try {
      useVoiceStore.setState({ isCameraOn: true });
      const { unmount } = renderBar();
      await waitFor(() => expect(onChange).not.toBeNull());
      expect(screen.queryByTestId('voice-bar-switch-camera')).toBeNull();
      cams = [{ kind: 'videoinput' }, { kind: 'audioinput' }, { kind: 'videoinput' }];
      onChange!();
      expect(await screen.findByTestId('voice-bar-switch-camera')).toBeTruthy();
      unmount();
      expect(removeEventListener).toHaveBeenCalledWith('devicechange', onChange);
    } finally {
      nav.mediaDevices = prev;
    }
  });
});
