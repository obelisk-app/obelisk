import { describe, it, expect, beforeEach } from 'vitest';
import { useVoiceStore } from './voice';

describe('useVoiceStore', () => {
  beforeEach(() => {
    useVoiceStore.setState(useVoiceStore.getInitialState());
  });

  it('has correct initial state', () => {
    const state = useVoiceStore.getState();
    expect(state.currentVoiceChannelId).toBeNull();
    expect(state.voiceParticipants).toEqual([]);
    expect(state.isMuted).toBe(false);
    expect(state.isDeafened).toBe(false);
    expect(state.connectionState).toBe('disconnected');
    expect(state.error).toBeNull();
  });

  it('sets voice channel', () => {
    useVoiceStore.getState().setVoiceChannel('ch1');
    expect(useVoiceStore.getState().currentVoiceChannelId).toBe('ch1');
  });

  it('manages participants', () => {
    const { addParticipant, removeParticipant, updateParticipant } = useVoiceStore.getState();

    addParticipant({ pubkey: 'pk1', muted: false, deafened: false, joinedAt: '2026-01-01' });
    addParticipant({ pubkey: 'pk2', muted: true, deafened: false, joinedAt: '2026-01-01' });
    expect(useVoiceStore.getState().voiceParticipants).toHaveLength(2);

    updateParticipant('pk1', { muted: true });
    expect(useVoiceStore.getState().voiceParticipants.find(p => p.pubkey === 'pk1')?.muted).toBe(true);

    removeParticipant('pk2');
    expect(useVoiceStore.getState().voiceParticipants).toHaveLength(1);
  });

  it('deduplicates participants on add', () => {
    const { addParticipant } = useVoiceStore.getState();
    addParticipant({ pubkey: 'pk1', muted: false, deafened: false, joinedAt: '2026-01-01' });
    addParticipant({ pubkey: 'pk1', muted: true, deafened: false, joinedAt: '2026-01-01' });
    expect(useVoiceStore.getState().voiceParticipants).toHaveLength(1);
    expect(useVoiceStore.getState().voiceParticipants[0].muted).toBe(true);
  });

  it('toggles mute and deafen', () => {
    useVoiceStore.getState().setMuted(true);
    expect(useVoiceStore.getState().isMuted).toBe(true);

    useVoiceStore.getState().setDeafened(true);
    expect(useVoiceStore.getState().isDeafened).toBe(true);
  });

  it('sets connectionState and error', () => {
    useVoiceStore.getState().setConnectionState('connecting');
    expect(useVoiceStore.getState().connectionState).toBe('connecting');

    useVoiceStore.getState().setConnectionState('connected');
    expect(useVoiceStore.getState().connectionState).toBe('connected');

    useVoiceStore.getState().setError('mic denied');
    expect(useVoiceStore.getState().error).toBe('mic denied');

    useVoiceStore.getState().setError(null);
    expect(useVoiceStore.getState().error).toBeNull();
  });

  it('leaveVoice resets all state', () => {
    useVoiceStore.setState({
      currentVoiceChannelId: 'ch1',
      voiceParticipants: [{ pubkey: 'pk1', muted: false, deafened: false, joinedAt: '' }],
      isMuted: true,
      isDeafened: true,
      connectionState: 'connected',
      error: 'some error',
    });

    useVoiceStore.getState().leaveVoice();
    const state = useVoiceStore.getState();
    expect(state.currentVoiceChannelId).toBeNull();
    expect(state.voiceParticipants).toEqual([]);
    expect(state.isMuted).toBe(false);
    expect(state.isDeafened).toBe(false);
    expect(state.connectionState).toBe('disconnected');
    expect(state.error).toBeNull();
  });
});
