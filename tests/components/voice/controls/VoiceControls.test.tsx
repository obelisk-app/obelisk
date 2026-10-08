/**
 * Tests for the floating voice-room control panel.
 *
 * Focus: the UI hooks correctly update the store and forward to the active
 * VoiceClient. The mic/cam/screen toggles are exercised lightly; the new
 * quality popover (gear → segmented selectors) is the centerpiece.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react';
import VoiceControls from '@/components/voice/controls/VoiceControls';
import { useVoiceStore } from '@/store/voice';
import { LocaleProvider } from '@tests/support/intl';

/** The component reads its copy from the dictionary, so it needs a provider. */
const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);


const activeClient = vi.hoisted(() => ({
  applyVideoQuality: vi.fn(async () => {}),
  broadcastReceivedQuality: vi.fn(async () => {}),
  setMicEnabled: vi.fn(async () => {}),
  setCameraEnabled: vi.fn(async () => {}),
  setScreenShareEnabled: vi.fn(async () => {}),
  setDeafenEnabled: vi.fn(),
  switchCamera: vi.fn(async () => {}),
}));

vi.mock('@/services/voice/active-client', () => ({
  getActiveVoiceClient: () => activeClient,
}));

beforeEach(() => {
  // Reset store + spies between tests.
  useVoiceStore.setState({
    isMuted: false,
    isDeafened: false,
    isCameraOn: false,
    isScreenSharing: false,
    error: null,
    videoQuality: 'auto',
    receivedVideoQuality: 'auto',
  });
  Object.values(activeClient).forEach((m) => (m as { mockReset?: () => void }).mockReset?.());
  activeClient.applyVideoQuality.mockResolvedValue(undefined);
  activeClient.broadcastReceivedQuality.mockResolvedValue(undefined);
  activeClient.setMicEnabled.mockResolvedValue(undefined);
  activeClient.setCameraEnabled.mockResolvedValue(undefined);
  activeClient.setScreenShareEnabled.mockResolvedValue(undefined);
  activeClient.switchCamera.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe('VoiceControls toolbar', () => {
  it('renders the core buttons', () => {
    renderLocalized(<VoiceControls onLeave={() => {}} />);
    expect(screen.getByTestId('mute-btn')).toBeInTheDocument();
    expect(screen.getByTestId('camera-btn')).toBeInTheDocument();
    expect(screen.getByTestId('quality-btn')).toBeInTheDocument();
    expect(screen.getByTestId('leave-voice-btn')).toBeInTheDocument();
  });

  it('mute button toggles via the active client', async () => {
    renderLocalized(<VoiceControls onLeave={() => {}} />);
    fireEvent.click(screen.getByTestId('mute-btn'));
    expect(activeClient.setMicEnabled).toHaveBeenCalled();
  });

  it('unmutes explicitly when the call starts listening-only', async () => {
    useVoiceStore.setState({ isMuted: true });
    renderLocalized(<VoiceControls onLeave={() => {}} />);
    fireEvent.click(screen.getByTestId('mute-btn'));
    expect(activeClient.setMicEnabled).toHaveBeenCalledWith(true);
  });

  it('camera button toggles via the active client', () => {
    renderLocalized(<VoiceControls onLeave={() => {}} />);
    fireEvent.click(screen.getByTestId('camera-btn'));
    expect(activeClient.setCameraEnabled).toHaveBeenCalledWith(true);
  });

  it('leave button fires the onLeave callback', () => {
    const onLeave = vi.fn();
    renderLocalized(<VoiceControls onLeave={onLeave} />);
    fireEvent.click(screen.getByTestId('leave-voice-btn'));
    expect(onLeave).toHaveBeenCalled();
  });
});

describe('VoiceControls quality popover', () => {
  it('is hidden by default and toggles open on gear click', () => {
    renderLocalized(<VoiceControls onLeave={() => {}} />);
    expect(screen.queryByTestId('quality-popover')).toBeNull();
    fireEvent.click(screen.getByTestId('quality-btn'));
    expect(screen.getByTestId('quality-popover')).toBeInTheDocument();
  });

  it('selecting "720p" for camera updates the store and forwards to client', async () => {
    renderLocalized(<VoiceControls onLeave={() => {}} />);
    fireEvent.click(screen.getByTestId('quality-btn'));

    fireEvent.click(screen.getByTestId('quality-out-720p'));
    // Wait for the async forwarding microtasks.
    await Promise.resolve();
    await Promise.resolve();

    expect(useVoiceStore.getState().videoQuality).toBe('720p');
    expect(activeClient.applyVideoQuality).toHaveBeenCalledWith('720p');
  });

  it('selecting "480p" for incoming updates the store and broadcasts a hint', async () => {
    renderLocalized(<VoiceControls onLeave={() => {}} />);
    fireEvent.click(screen.getByTestId('quality-btn'));

    fireEvent.click(screen.getByTestId('quality-in-480p'));
    await Promise.resolve();
    await Promise.resolve();

    expect(useVoiceStore.getState().receivedVideoQuality).toBe('480p');
    expect(activeClient.broadcastReceivedQuality).toHaveBeenCalledWith('480p');
  });

  it('renders the four quality tiers per direction', () => {
    renderLocalized(<VoiceControls onLeave={() => {}} />);
    fireEvent.click(screen.getByTestId('quality-btn'));
    for (const q of ['auto', '1080p', '720p', '480p']) {
      expect(screen.getByTestId(`quality-out-${q}`)).toBeInTheDocument();
      expect(screen.getByTestId(`quality-in-${q}`)).toBeInTheDocument();
    }
  });

  it('shows the audio-quality footnote', () => {
    renderLocalized(<VoiceControls onLeave={() => {}} />);
    fireEvent.click(screen.getByTestId('quality-btn'));
    expect(screen.getByText(/audio is always sent at high quality/i)).toBeInTheDocument();
  });
});

describe('VoiceControls behaviours', () => {
  it('deafen silences playback, mirrors the store, mutes the mic and reports a mic that will not stop', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    activeClient.setMicEnabled.mockRejectedValueOnce(new Error('stuck'));
    renderLocalized(<VoiceControls onLeave={() => {}} />);
    fireEvent.click(screen.getByTestId('deafen-btn'));
    expect(activeClient.setDeafenEnabled).toHaveBeenCalledWith(true);
    expect(useVoiceStore.getState().isDeafened).toBe(true);
    expect(activeClient.setMicEnabled).toHaveBeenCalledWith(false);
    await waitFor(() => expect(warn).toHaveBeenCalledWith('[voice] mic did not stop on deafen', expect.any(Error)));
    warn.mockRestore();
  });

  it('a declined camera or screen prompt is not shown as an error; other failures are', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    activeClient.setCameraEnabled.mockRejectedValueOnce(denied);
    activeClient.setScreenShareEnabled.mockRejectedValueOnce(new Error('no display'));
    renderLocalized(<VoiceControls onLeave={() => {}} />);
    fireEvent.click(screen.getByTestId('camera-btn'));
    await waitFor(() => expect(activeClient.setCameraEnabled).toHaveBeenCalled());
    expect(useVoiceStore.getState().error).toBeNull();
    fireEvent.click(screen.getByTestId('screen-share-btn'));
    await waitFor(() => expect(screen.getByTestId('voice-error')).toHaveTextContent("Couldn't share your screen."));
  });

  it('a mic failure is surfaced, and the chat toggle is wired through', async () => {
    activeClient.setMicEnabled.mockRejectedValueOnce(new Error('mic blocked'));
    const onToggleChat = vi.fn();
    renderLocalized(<VoiceControls onLeave={() => {}} onToggleChat={onToggleChat} isChatOpen={false} />);
    fireEvent.click(screen.getByTestId('mute-btn'));
    await waitFor(() => expect(screen.getByTestId('voice-error')).toHaveTextContent("Couldn't turn on the microphone."));
    fireEvent.click(screen.getByTestId('voice-chat-toggle'));
    expect(onToggleChat).toHaveBeenCalledTimes(1);
  });

  it('shows the camera flip with two cameras and reports a failed flip', async () => {
    const nav = globalThis.navigator as unknown as { mediaDevices?: unknown };
    const prev = nav.mediaDevices;
    nav.mediaDevices = { enumerateDevices: async () => [{ kind: 'videoinput' }, { kind: 'videoinput' }] };
    activeClient.switchCamera.mockRejectedValueOnce(new Error('flip failed'));
    try {
      useVoiceStore.setState({ isCameraOn: true });
      renderLocalized(<VoiceControls onLeave={() => {}} />);
      fireEvent.click(await screen.findByTestId('switch-camera-btn'));
      await waitFor(() => expect(screen.getByTestId('voice-error')).toHaveTextContent("Couldn't switch camera."));
    } finally {
      nav.mediaDevices = prev;
    }
  });

  it('a rejected quality change is surfaced', async () => {
    activeClient.applyVideoQuality.mockRejectedValueOnce(new Error('no sender'));
    renderLocalized(<VoiceControls onLeave={() => {}} />);
    fireEvent.click(screen.getByTestId('quality-btn'));
    fireEvent.click(screen.getByTestId('quality-out-1080p'));
    await waitFor(() => expect(screen.getByTestId('voice-error')).toHaveTextContent("Couldn't change the video quality."));
    expect(useVoiceStore.getState().videoQuality).toBe('1080p');
  });
});

describe('VoiceControls error surface', () => {
  it('says why the switch-camera button is missing when device enumeration fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const nav = globalThis.navigator as unknown as { mediaDevices?: unknown };
    const prev = nav.mediaDevices;
    nav.mediaDevices = { enumerateDevices: async () => { throw new Error('devices blocked'); } };
    try {
      useVoiceStore.setState({ isCameraOn: true });
      renderLocalized(<VoiceControls onLeave={() => {}} />);
      await waitFor(() => expect(warn).toHaveBeenCalledWith(
        '[voice] enumerateDevices failed; the switch-camera button stays hidden', expect.any(Error),
      ));
      expect(screen.queryByTestId('switch-camera-btn')).toBeNull();
    } finally {
      nav.mediaDevices = prev;
      warn.mockRestore();
    }
  });

  it('renders an error code in the reader language, and any other text as it is', () => {
    useVoiceStore.setState({ error: 'cameraLimit' });
    const { unmount } = renderLocalized(<VoiceControls onLeave={() => {}} />);
    expect(screen.getByTestId('voice-error')).toHaveTextContent('Camera limit reached (4/4).');
    unmount();
    useVoiceStore.setState({ error: 'mic blocked' });
    render(<LocaleProvider initialLocale="es"><VoiceControls onLeave={() => {}} /></LocaleProvider>);
    expect(screen.getByTestId('voice-error')).toHaveTextContent('mic blocked');
  });

  it('names a missing device instead of repeating the browser wording', async () => {
    activeClient.setCameraEnabled.mockRejectedValueOnce(Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' }));
    render(<LocaleProvider initialLocale="es"><VoiceControls onLeave={() => {}} /></LocaleProvider>);
    fireEvent.click(screen.getByTestId('camera-btn'));
    await waitFor(() => expect(screen.getByTestId('voice-error')).toHaveTextContent('No se encontró ningún micrófono ni cámara.'));
  });
});

describe('VoiceControls details', () => {
  const CIRCLE = 'w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95 ';
  const DANGER = 'bg-red-500/15 text-red-300 hover:bg-red-500/25 ring-1 ring-red-500/30';
  const ACTIVE = 'bg-lc-green/20 text-lc-green hover:bg-lc-green/30 ring-1 ring-lc-green/40';
  const IDLE = 'bg-white/5 text-white/85 hover:bg-white/10 ring-1 ring-white/10';

  it('keeps the look, title and label of each round button for its state', () => {
    useVoiceStore.setState({ isMuted: true, isDeafened: false, isCameraOn: true, isScreenSharing: true });
    renderLocalized(<VoiceControls onLeave={() => {}} onToggleChat={() => {}} isChatOpen />);
    const mute = screen.getByTestId('mute-btn');
    expect(mute).toHaveClass(CIRCLE + DANGER);
    expect(mute.title).toBe('Unmute');
    expect(mute.getAttribute('aria-label')).toBe('Unmute');
    expect(screen.getByTestId('deafen-btn')).toHaveClass(CIRCLE + ACTIVE);
    expect(screen.getByTestId('deafen-btn').title).toBe('Deafen');
    expect(screen.getByTestId('camera-btn')).toHaveClass(CIRCLE + ACTIVE);
    expect(screen.getByTestId('camera-btn').title).toBe('Turn off camera');
    expect(screen.getByTestId('screen-share-btn')).toHaveClass(CIRCLE + ACTIVE + ' hidden sm:flex');
    expect(screen.getByTestId('screen-share-btn').title).toBe('Stop sharing');
    expect(screen.getByTestId('voice-chat-toggle')).toHaveClass(CIRCLE + ACTIVE);
    expect(screen.getByTestId('voice-chat-toggle').title).toBe('Hide chat');
    expect(screen.getByTestId('quality-btn')).toHaveClass(CIRCLE + IDLE);
    expect(screen.getByTestId('quality-btn').getAttribute('aria-label')).toBe('Video quality');
  });

  it('has no chat toggle without a handler, and an idle one while the chat is closed', () => {
    const { unmount } = renderLocalized(<VoiceControls onLeave={() => {}} />);
    expect(screen.queryByTestId('voice-chat-toggle')).toBeNull();
    unmount();
    renderLocalized(<VoiceControls onLeave={() => {}} onToggleChat={() => {}} />);
    expect(screen.getByTestId('voice-chat-toggle')).toHaveClass(CIRCLE + IDLE);
    expect(screen.getByTestId('voice-chat-toggle').title).toBe('Show chat');
  });

  it('turns the camera and the screen share off when they are on, and undeafens without touching the mic', () => {
    useVoiceStore.setState({ isCameraOn: true, isScreenSharing: true, isDeafened: true });
    renderLocalized(<VoiceControls onLeave={() => {}} />);
    fireEvent.click(screen.getByTestId('camera-btn'));
    expect(activeClient.setCameraEnabled).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByTestId('screen-share-btn'));
    expect(activeClient.setScreenShareEnabled).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByTestId('deafen-btn'));
    expect(activeClient.setDeafenEnabled).toHaveBeenCalledWith(false);
    expect(useVoiceStore.getState().isDeafened).toBe(false);
    expect(activeClient.setMicEnabled).not.toHaveBeenCalled();
  });

  it('the gear closes the quality popover on a second click and lights up while it is open', () => {
    renderLocalized(<VoiceControls onLeave={() => {}} />);
    fireEvent.click(screen.getByTestId('quality-btn'));
    expect(screen.getByTestId('quality-btn')).toHaveClass(CIRCLE + ACTIVE);
    fireEvent.click(screen.getByTestId('quality-btn'));
    expect(screen.queryByTestId('quality-popover')).toBeNull();
  });
});
