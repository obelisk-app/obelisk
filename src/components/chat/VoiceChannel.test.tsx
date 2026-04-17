import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
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
    expect(screen.getByText('voice-chat')).toBeInTheDocument();
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

  describe('speaking orb', () => {
    it('is off when the participant is silent', () => {
      useVoiceStore.setState({
        currentVoiceChannelId: 'vc1',
        voiceParticipants: [{ pubkey: 'pk1', muted: false, deafened: false, joinedAt: '' }],
        speakingPubkeys: new Set<string>(),
      });
      render(<VoiceChannel {...defaultProps} />);
      const avatar = screen.getByRole('img', { name: 'Alice' });
      expect(avatar.className).not.toContain('ring-lc-green');
    });

    it('is on when the participant is speaking and unmuted', () => {
      useVoiceStore.setState({
        currentVoiceChannelId: 'vc1',
        voiceParticipants: [{ pubkey: 'pk1', muted: false, deafened: false, joinedAt: '' }],
        speakingPubkeys: new Set(['pk1']),
      });
      render(<VoiceChannel {...defaultProps} />);
      const tile = screen.getByTestId('voice-participant');
      expect(tile.className).toContain('ring-lc-green');
    });

    it('is suppressed when the participant is muted even if detector reports speaking', () => {
      useVoiceStore.setState({
        currentVoiceChannelId: 'vc1',
        voiceParticipants: [{ pubkey: 'pk1', muted: true, deafened: false, joinedAt: '' }],
        speakingPubkeys: new Set(['pk1']),
      });
      render(<VoiceChannel {...defaultProps} />);
      const avatar = screen.getByRole('img', { name: 'Alice' });
      expect(avatar.className).not.toContain('ring-lc-green');
    });
  });

  describe('local per-user mute', () => {
    it('renders the local-mute toggle on remote participants', () => {
      useVoiceStore.setState({
        currentVoiceChannelId: 'vc1',
        voiceParticipants: [{ pubkey: 'pk1', muted: false, deafened: false, joinedAt: '' }],
      });
      render(<VoiceChannel {...defaultProps} />);
      expect(screen.getByTestId('local-mute-btn')).toBeInTheDocument();
    });

    it('toggleLocalMute updates the store set on click', () => {
      useVoiceStore.setState({
        currentVoiceChannelId: 'vc1',
        voiceParticipants: [{ pubkey: 'pk1', muted: false, deafened: false, joinedAt: '' }],
      });
      render(<VoiceChannel {...defaultProps} />);
      expect(useVoiceStore.getState().localMutedPubkeys.has('pk1')).toBe(false);
      // Use native .click() — jsdom's userEvent hit-test misses absolutely
      // positioned buttons layered over the avatar container.
      const btn = screen.getByTestId('local-mute-btn') as HTMLButtonElement;
      btn.click();
      expect(useVoiceStore.getState().localMutedPubkeys.has('pk1')).toBe(true);
      btn.click();
      expect(useVoiceStore.getState().localMutedPubkeys.has('pk1')).toBe(false);
    });
  });

  describe('companion text chat toggle', () => {
    it('renders the top-right chat toggle when chatSlot is provided', () => {
      render(
        <VoiceChannel
          {...defaultProps}
          chatSlot={<div>chat</div>}
        />,
      );
      expect(screen.getByTestId('voice-chat-toggle')).toBeInTheDocument();
    });

    it('does not render the toggle when no chatSlot is passed', () => {
      render(<VoiceChannel {...defaultProps} />);
      expect(screen.queryByTestId('voice-chat-toggle')).not.toBeInTheDocument();
    });

    it('toggle opens the chat via isVoiceChatOpen flag', () => {
      render(<VoiceChannel {...defaultProps} chatSlot={<div>chat</div>} />);
      expect(useVoiceStore.getState().isVoiceChatOpen).toBe(false);
      fireEvent.click(screen.getByTestId('voice-chat-toggle'));
      expect(useVoiceStore.getState().isVoiceChatOpen).toBe(true);
      // When open, the open-button is hidden; closing is done via the rail's close button at the page level.
      expect(screen.queryByTestId('voice-chat-toggle')).not.toBeInTheDocument();
    });
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
