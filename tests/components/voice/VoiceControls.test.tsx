/**
 * Tests for the floating voice-room control panel.
 *
 * Focus: the UI hooks correctly update the store and forward to the active
 * VoiceClient. The mic/cam/screen toggles are exercised lightly; the new
 * quality popover (gear → segmented selectors) is the centerpiece.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react';
import VoiceControls from '@/components/voice/VoiceControls';
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
    await waitFor(() => expect(screen.getByTestId('voice-error')).toHaveTextContent('no display'));
  });

  it('a mic failure is surfaced, and the chat toggle is wired through', async () => {
    activeClient.setMicEnabled.mockRejectedValueOnce(new Error('mic blocked'));
    const onToggleChat = vi.fn();
    renderLocalized(<VoiceControls onLeave={() => {}} onToggleChat={onToggleChat} isChatOpen={false} />);
    fireEvent.click(screen.getByTestId('mute-btn'));
    await waitFor(() => expect(screen.getByTestId('voice-error')).toHaveTextContent('mic blocked'));
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
      await waitFor(() => expect(screen.getByTestId('voice-error')).toHaveTextContent('flip failed'));
    } finally {
      nav.mediaDevices = prev;
    }
  });

  it('a rejected quality change is surfaced', async () => {
    activeClient.applyVideoQuality.mockRejectedValueOnce(new Error('no sender'));
    renderLocalized(<VoiceControls onLeave={() => {}} />);
    fireEvent.click(screen.getByTestId('quality-btn'));
    fireEvent.click(screen.getByTestId('quality-out-1080p'));
    await waitFor(() => expect(screen.getByTestId('voice-error')).toHaveTextContent('no sender'));
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

  it('renders the current error message', () => {
    useVoiceStore.setState({ error: 'mic blocked' });
    renderLocalized(<VoiceControls onLeave={() => {}} />);
    expect(screen.getByTestId('voice-error')).toHaveTextContent('mic blocked');
  });
});
