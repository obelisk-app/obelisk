import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import VoiceControls from './VoiceControls';
import { useVoiceStore } from '@/store/voice';

const defaultProps = {
  isMuted: false,
  isDeafened: false,
  onToggleMute: vi.fn(),
  onToggleDeafen: vi.fn(),
  onLeave: vi.fn(),
  onToggleCamera: vi.fn(),
  onToggleScreenShare: vi.fn(),
};

describe('VoiceControls', () => {
  beforeEach(() => {
    useVoiceStore.setState(useVoiceStore.getInitialState());
  });

  it('renders mute, deafen, camera, screen share, and leave buttons', () => {
    render(<VoiceControls {...defaultProps} />);
    expect(screen.getByTestId('mute-btn')).toBeInTheDocument();
    expect(screen.getByTestId('deafen-btn')).toBeInTheDocument();
    expect(screen.getByTestId('camera-btn')).toBeInTheDocument();
    expect(screen.getByTestId('screen-share-btn')).toBeInTheDocument();
    expect(screen.getByTestId('leave-voice-btn')).toBeInTheDocument();
  });

  it('calls onToggleMute when mute clicked', async () => {
    const onMute = vi.fn();
    const user = userEvent.setup();
    render(<VoiceControls {...defaultProps} onToggleMute={onMute} />);
    await user.click(screen.getByTestId('mute-btn'));
    expect(onMute).toHaveBeenCalled();
  });

  it('calls onLeave when disconnect clicked', async () => {
    const onLeave = vi.fn();
    const user = userEvent.setup();
    render(<VoiceControls {...defaultProps} onLeave={onLeave} />);
    await user.click(screen.getByTestId('leave-voice-btn'));
    expect(onLeave).toHaveBeenCalled();
  });

  it('calls onToggleCamera when camera clicked', async () => {
    const onToggleCamera = vi.fn();
    const user = userEvent.setup();
    render(<VoiceControls {...defaultProps} onToggleCamera={onToggleCamera} />);
    await user.click(screen.getByTestId('camera-btn'));
    expect(onToggleCamera).toHaveBeenCalled();
  });

  it('calls onToggleScreenShare when screen share clicked', async () => {
    const onToggleScreenShare = vi.fn();
    const user = userEvent.setup();
    render(<VoiceControls {...defaultProps} onToggleScreenShare={onToggleScreenShare} />);
    await user.click(screen.getByTestId('screen-share-btn'));
    expect(onToggleScreenShare).toHaveBeenCalled();
  });

  it('shows muted styling when muted', () => {
    render(<VoiceControls {...defaultProps} isMuted={true} />);
    expect(screen.getByTestId('mute-btn').className).toContain('bg-red-600/20');
  });

  it('shows active camera styling when camera is on', () => {
    useVoiceStore.setState({ isCameraOn: true });
    render(<VoiceControls {...defaultProps} />);
    expect(screen.getByTestId('camera-btn').className).toContain('bg-lc-green/20');
  });

  it('shows active screen share styling when sharing', () => {
    useVoiceStore.setState({ isScreenSharing: true });
    render(<VoiceControls {...defaultProps} />);
    expect(screen.getByTestId('screen-share-btn').className).toContain('bg-lc-green/20');
  });

  it('shows error when voice store has error', () => {
    useVoiceStore.setState({ error: 'Voice connection failed' });
    render(<VoiceControls {...defaultProps} />);
    expect(screen.getByTestId('voice-error')).toHaveTextContent('Voice connection failed');
  });

  it('shows connecting state', () => {
    useVoiceStore.setState({ connectionState: 'connecting' });
    render(<VoiceControls {...defaultProps} />);
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
  });
});
