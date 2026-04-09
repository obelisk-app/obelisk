import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import VoiceChannel from './VoiceChannel';
import { useVoiceStore } from '@/store/voice';

describe('VoiceChannel', () => {
  const profileCache = new Map<string, { name?: string; picture?: string }>();

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
    render(
      <VoiceChannel
        channelId="vc1"
        channelName="voice-chat"
        profileCache={profileCache}
        onJoin={vi.fn()}
        onLeave={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleDeafen={vi.fn()}
      />
    );
    expect(screen.getByText('Voice Channel — #voice-chat')).toBeInTheDocument();
    expect(screen.getByTestId('join-voice-btn')).toBeInTheDocument();
  });

  it('calls onJoin when clicking join', async () => {
    const onJoin = vi.fn();
    const user = userEvent.setup();
    render(
      <VoiceChannel
        channelId="vc1"
        channelName="voice-chat"
        profileCache={profileCache}
        onJoin={onJoin}
        onLeave={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleDeafen={vi.fn()}
      />
    );
    await user.click(screen.getByTestId('join-voice-btn'));
    expect(onJoin).toHaveBeenCalledWith('vc1');
  });

  it('renders participants when in channel', () => {
    useVoiceStore.setState({
      currentVoiceChannelId: 'vc1',
      voiceParticipants: [
        { pubkey: 'pk1', muted: false, deafened: false, joinedAt: '2026-01-01' },
        { pubkey: 'pk2', muted: true, deafened: false, joinedAt: '2026-01-01' },
      ],
    });

    render(
      <VoiceChannel
        channelId="vc1"
        channelName="voice-chat"
        profileCache={profileCache}
        onJoin={vi.fn()}
        onLeave={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleDeafen={vi.fn()}
      />
    );
    expect(screen.getAllByTestId('voice-participant')).toHaveLength(2);
    expect(screen.getByTestId('voice-controls')).toBeInTheDocument();
  });

  it('shows voice controls only when in the channel', () => {
    useVoiceStore.setState({
      currentVoiceChannelId: 'other-channel',
      voiceParticipants: [
        { pubkey: 'pk1', muted: false, deafened: false, joinedAt: '2026-01-01' },
      ],
    });

    render(
      <VoiceChannel
        channelId="vc1"
        channelName="voice-chat"
        profileCache={profileCache}
        onJoin={vi.fn()}
        onLeave={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleDeafen={vi.fn()}
      />
    );
    expect(screen.queryByTestId('voice-controls')).not.toBeInTheDocument();
  });
});
