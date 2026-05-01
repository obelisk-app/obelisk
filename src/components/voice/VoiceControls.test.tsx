/**
 * Tests for the floating voice-room control panel.
 *
 * Focus: the UI hooks correctly update the store and forward to the active
 * VoiceClient. The mic/cam/screen toggles are exercised lightly; the new
 * quality popover (gear → segmented selectors) is the centerpiece.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import VoiceControls from './VoiceControls';
import { useVoiceStore } from '@/store/voice';

const activeClient = vi.hoisted(() => ({
  applyVideoQuality: vi.fn(async () => {}),
  broadcastReceivedQuality: vi.fn(async () => {}),
  setMicEnabled: vi.fn(async () => {}),
  setCameraEnabled: vi.fn(async () => {}),
  setScreenShareEnabled: vi.fn(async () => {}),
  setDeafenEnabled: vi.fn(),
}));

vi.mock('@/lib/voice/active-client', () => ({
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
  Object.values(activeClient).forEach((m) => (m as { mockClear?: () => void }).mockClear?.());
});

afterEach(() => {
  cleanup();
});

describe('VoiceControls toolbar', () => {
  it('renders the core buttons', () => {
    render(<VoiceControls onLeave={() => {}} />);
    expect(screen.getByTestId('mute-btn')).toBeInTheDocument();
    expect(screen.getByTestId('camera-btn')).toBeInTheDocument();
    expect(screen.getByTestId('quality-btn')).toBeInTheDocument();
    expect(screen.getByTestId('leave-voice-btn')).toBeInTheDocument();
  });

  it('mute button toggles via the active client', async () => {
    render(<VoiceControls onLeave={() => {}} />);
    fireEvent.click(screen.getByTestId('mute-btn'));
    expect(activeClient.setMicEnabled).toHaveBeenCalled();
  });

  it('camera button toggles via the active client', () => {
    render(<VoiceControls onLeave={() => {}} />);
    fireEvent.click(screen.getByTestId('camera-btn'));
    expect(activeClient.setCameraEnabled).toHaveBeenCalledWith(true);
  });

  it('leave button fires the onLeave callback', () => {
    const onLeave = vi.fn();
    render(<VoiceControls onLeave={onLeave} />);
    fireEvent.click(screen.getByTestId('leave-voice-btn'));
    expect(onLeave).toHaveBeenCalled();
  });
});

describe('VoiceControls quality popover', () => {
  it('is hidden by default and toggles open on gear click', () => {
    render(<VoiceControls onLeave={() => {}} />);
    expect(screen.queryByTestId('quality-popover')).toBeNull();
    fireEvent.click(screen.getByTestId('quality-btn'));
    expect(screen.getByTestId('quality-popover')).toBeInTheDocument();
  });

  it('selecting "720p" for camera updates the store and forwards to client', async () => {
    render(<VoiceControls onLeave={() => {}} />);
    fireEvent.click(screen.getByTestId('quality-btn'));

    fireEvent.click(screen.getByTestId('quality-out-720p'));
    // Wait for the async forwarding microtasks.
    await Promise.resolve();
    await Promise.resolve();

    expect(useVoiceStore.getState().videoQuality).toBe('720p');
    expect(activeClient.applyVideoQuality).toHaveBeenCalledWith('720p');
  });

  it('selecting "480p" for incoming updates the store and broadcasts a hint', async () => {
    render(<VoiceControls onLeave={() => {}} />);
    fireEvent.click(screen.getByTestId('quality-btn'));

    fireEvent.click(screen.getByTestId('quality-in-480p'));
    await Promise.resolve();
    await Promise.resolve();

    expect(useVoiceStore.getState().receivedVideoQuality).toBe('480p');
    expect(activeClient.broadcastReceivedQuality).toHaveBeenCalledWith('480p');
  });

  it('renders the four quality tiers per direction', () => {
    render(<VoiceControls onLeave={() => {}} />);
    fireEvent.click(screen.getByTestId('quality-btn'));
    for (const q of ['auto', '1080p', '720p', '480p']) {
      expect(screen.getByTestId(`quality-out-${q}`)).toBeInTheDocument();
      expect(screen.getByTestId(`quality-in-${q}`)).toBeInTheDocument();
    }
  });

  it('shows the audio-quality footnote', () => {
    render(<VoiceControls onLeave={() => {}} />);
    fireEvent.click(screen.getByTestId('quality-btn'));
    expect(screen.getByText(/audio is always sent at high quality/i)).toBeInTheDocument();
  });
});

describe('VoiceControls error surface', () => {
  it('renders the current error message', () => {
    useVoiceStore.setState({ error: 'mic blocked' });
    render(<VoiceControls onLeave={() => {}} />);
    expect(screen.getByTestId('voice-error')).toHaveTextContent('mic blocked');
  });
});
