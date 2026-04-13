import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import VoiceChannel from './VoiceChannel';
import { useVoiceStore } from '@/store/voice';

describe('VoiceChannel', () => {
  const profileCache = new Map<string, { name?: string; picture?: string }>();

  const defaultProps = {
    channelId: 'vc1',
    channelName: 'voice-chat',
    profileCache,
    onJoin: vi.fn(),
    onLeave: vi.fn(),
    onToggleMute: vi.fn(),
    onToggleDeafen: vi.fn(),
    onToggleCamera: vi.fn(),
    onToggleScreenShare: vi.fn(),
  };

  beforeEach(() => {
    useVoiceStore.setState(useVoiceStore.getInitialState());
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ participants: [] }),
    }) as any;
    profileCache.clear();
    profileCache.set('pk1', { name: 'Alice', picture: 'https://example.com/alice.jpg' });
  });

  it('renders empty state with join button', () => {
    render(<VoiceChannel {...defaultProps} />);
    expect(screen.getByText('Voice Channel — #voice-chat')).toBeInTheDocument();
    expect(screen.getByTestId('join-voice-btn')).toBeInTheDocument();
  });

  it('calls onJoin when clicking join', async () => {
    const onJoin = vi.fn();
    const user = userEvent.setup();
    render(<VoiceChannel {...defaultProps} onJoin={onJoin} />);
    await user.click(screen.getByTestId('join-voice-btn'));
    expect(onJoin).toHaveBeenCalledWith('vc1');
  });

  it('renders participants when in channel (audio only)', () => {
    useVoiceStore.setState({
      currentVoiceChannelId: 'vc1',
      voiceParticipants: [
        { pubkey: 'pk1', muted: false, deafened: false, joinedAt: '2026-01-01' },
        { pubkey: 'pk2', muted: true, deafened: false, joinedAt: '2026-01-01' },
      ],
    });

    render(<VoiceChannel {...defaultProps} />);
    expect(screen.getAllByTestId('voice-participant')).toHaveLength(2);
    expect(screen.getByTestId('voice-controls')).toBeInTheDocument();
  });

  it('renders screen share area when remote screen is active', () => {
    const screenEl = document.createElement('video');
    const screenElements = new Map<string, HTMLVideoElement>();
    screenElements.set('pk1', screenEl);

    useVoiceStore.setState({
      currentVoiceChannelId: 'vc1',
      voiceParticipants: [
        { pubkey: 'pk1', muted: false, deafened: false, joinedAt: '2026-01-01' },
      ],
      remoteScreens: new Set(['pk1']),
      screenElements,
    });

    render(<VoiceChannel {...defaultProps} />);
    expect(screen.getByTestId('screen-share-area')).toBeInTheDocument();
    expect(screen.getByText(/sharing their screen/)).toBeInTheDocument();
  });

  it('shows video grid when remote video is active', () => {
    const videoEl = document.createElement('video');
    const videoElements = new Map<string, HTMLVideoElement>();
    videoElements.set('pk1', videoEl);

    useVoiceStore.setState({
      currentVoiceChannelId: 'vc1',
      voiceParticipants: [
        { pubkey: 'pk1', muted: false, deafened: false, joinedAt: '2026-01-01' },
        { pubkey: 'pk2', muted: true, deafened: false, joinedAt: '2026-01-01' },
      ],
      remoteVideos: new Set(['pk1']),
      videoElements,
    });

    render(<VoiceChannel {...defaultProps} />);
    expect(screen.getByTestId('video-grid')).toBeInTheDocument();
    expect(screen.getAllByTestId('video-tile')).toHaveLength(1);
    expect(screen.getByTestId('camera-badge')).toBeInTheDocument();
    // pk2 should be in audio-only section
    expect(screen.getByTestId('audio-participants')).toBeInTheDocument();
  });

  it('shows focused view when focusedPubkey is set', () => {
    const videoEl = document.createElement('video');
    const videoElements = new Map<string, HTMLVideoElement>();
    videoElements.set('pk1', videoEl);

    useVoiceStore.setState({
      currentVoiceChannelId: 'vc1',
      voiceParticipants: [
        { pubkey: 'pk1', muted: false, deafened: false, joinedAt: '2026-01-01' },
        { pubkey: 'pk2', muted: false, deafened: false, joinedAt: '2026-01-01' },
      ],
      remoteVideos: new Set(['pk1']),
      videoElements,
      focusedPubkey: 'pk1',
    });

    render(<VoiceChannel {...defaultProps} />);
    expect(screen.getByTestId('focused-view')).toBeInTheDocument();
    expect(screen.getByTestId('focused-video')).toBeInTheDocument();
    expect(screen.getByTestId('unfocus-btn')).toBeInTheDocument();
  });

  it('setFocusedPubkey toggles focus in store', () => {
    useVoiceStore.getState().setFocusedPubkey('pk1');
    expect(useVoiceStore.getState().focusedPubkey).toBe('pk1');
    useVoiceStore.getState().setFocusedPubkey('pk1');
    // Calling again with same value doesn't toggle in store (component handles toggle)
    expect(useVoiceStore.getState().focusedPubkey).toBe('pk1');
    useVoiceStore.getState().setFocusedPubkey(null);
    expect(useVoiceStore.getState().focusedPubkey).toBeNull();
  });

  it('unfocuses when clicking the X button', async () => {
    const videoEl = document.createElement('video');
    const videoElements = new Map<string, HTMLVideoElement>();
    videoElements.set('pk1', videoEl);

    useVoiceStore.setState({
      currentVoiceChannelId: 'vc1',
      voiceParticipants: [
        { pubkey: 'pk1', muted: false, deafened: false, joinedAt: '2026-01-01' },
      ],
      remoteVideos: new Set(['pk1']),
      videoElements,
      focusedPubkey: 'pk1',
    });

    const user = userEvent.setup();
    render(<VoiceChannel {...defaultProps} />);

    expect(screen.getByTestId('focused-view')).toBeInTheDocument();
    await user.click(screen.getByTestId('unfocus-btn'));
    expect(screen.queryByTestId('focused-view')).not.toBeInTheDocument();
  });

  it('shows local screen share indicator', () => {
    useVoiceStore.setState({
      currentVoiceChannelId: 'vc1',
      voiceParticipants: [
        { pubkey: 'pk1', muted: false, deafened: false, joinedAt: '2026-01-01' },
      ],
      isScreenSharing: true,
      localScreenStream: {} as MediaStream,
    });

    render(<VoiceChannel {...defaultProps} />);
    expect(screen.getByTestId('local-screen-share')).toBeInTheDocument();
  });

  it('shows voice controls only when in the channel', () => {
    useVoiceStore.setState({
      currentVoiceChannelId: 'other-channel',
      voiceParticipants: [
        { pubkey: 'pk1', muted: false, deafened: false, joinedAt: '2026-01-01' },
      ],
    });

    render(<VoiceChannel {...defaultProps} />);
    expect(screen.queryByTestId('voice-controls')).not.toBeInTheDocument();
  });

  it('separates audio-only participants below video grid', () => {
    const videoEl = document.createElement('video');
    const videoElements = new Map<string, HTMLVideoElement>();
    videoElements.set('pk1', videoEl);
    profileCache.set('pk2', { name: 'Bob' });
    profileCache.set('pk3', { name: 'Charlie' });

    useVoiceStore.setState({
      currentVoiceChannelId: 'vc1',
      voiceParticipants: [
        { pubkey: 'pk1', muted: false, deafened: false, joinedAt: '2026-01-01' },
        { pubkey: 'pk2', muted: false, deafened: false, joinedAt: '2026-01-01' },
        { pubkey: 'pk3', muted: true, deafened: false, joinedAt: '2026-01-01' },
      ],
      remoteVideos: new Set(['pk1']),
      videoElements,
    });

    render(<VoiceChannel {...defaultProps} />);
    // pk1 in video grid, pk2 and pk3 in audio section
    expect(screen.getByTestId('video-grid')).toBeInTheDocument();
    expect(screen.getByTestId('audio-participants')).toBeInTheDocument();
    expect(screen.getByText('Audio only')).toBeInTheDocument();
  });
});
