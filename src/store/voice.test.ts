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

  it('manages remote video tracking with elements', () => {
    const el = document.createElement('video') as HTMLVideoElement;
    useVoiceStore.getState().addRemoteVideo('pk1', el);
    expect(useVoiceStore.getState().remoteVideos.has('pk1')).toBe(true);
    expect(useVoiceStore.getState().videoElements.get('pk1')).toBe(el);

    useVoiceStore.getState().removeRemoteVideo('pk1');
    expect(useVoiceStore.getState().remoteVideos.has('pk1')).toBe(false);
    expect(useVoiceStore.getState().videoElements.has('pk1')).toBe(false);
  });

  it('manages remote screen tracking with elements', () => {
    const el = document.createElement('video') as HTMLVideoElement;
    useVoiceStore.getState().addRemoteScreen('pk1', el);
    expect(useVoiceStore.getState().remoteScreens.has('pk1')).toBe(true);
    expect(useVoiceStore.getState().screenElements.get('pk1')).toBe(el);

    useVoiceStore.getState().removeRemoteScreen('pk1');
    expect(useVoiceStore.getState().remoteScreens.has('pk1')).toBe(false);
    expect(useVoiceStore.getState().screenElements.has('pk1')).toBe(false);
  });

  it('sets local camera and screen streams', () => {
    const stream = { id: 'mock' } as any as MediaStream;
    useVoiceStore.getState().setLocalCameraStream(stream);
    expect(useVoiceStore.getState().localCameraStream).toBe(stream);

    useVoiceStore.getState().setLocalScreenStream(stream);
    expect(useVoiceStore.getState().localScreenStream).toBe(stream);
  });

  it('leaveVoice clears video/screen elements and streams', () => {
    const el = document.createElement('video') as HTMLVideoElement;
    useVoiceStore.getState().addRemoteVideo('pk1', el);
    useVoiceStore.getState().addRemoteScreen('pk2', el);
    useVoiceStore.getState().setLocalCameraStream({ id: 'mock' } as any);

    useVoiceStore.getState().leaveVoice();
    const state = useVoiceStore.getState();
    expect(state.videoElements.size).toBe(0);
    expect(state.screenElements.size).toBe(0);
    expect(state.localCameraStream).toBeNull();
    expect(state.localScreenStream).toBeNull();
  });

  it('manages focusedPubkey', () => {
    useVoiceStore.getState().setFocusedPubkey('pk1');
    expect(useVoiceStore.getState().focusedPubkey).toBe('pk1');

    useVoiceStore.getState().setFocusedPubkey(null);
    expect(useVoiceStore.getState().focusedPubkey).toBeNull();
  });

  it('leaveVoice resets focusedPubkey', () => {
    useVoiceStore.getState().setFocusedPubkey('pk1');
    useVoiceStore.getState().leaveVoice();
    expect(useVoiceStore.getState().focusedPubkey).toBeNull();
  });

  describe('speakingPubkeys', () => {
    it('starts empty', () => {
      expect(useVoiceStore.getState().speakingPubkeys.size).toBe(0);
    });

    it('setSpeaking adds and removes pubkeys', () => {
      const { setSpeaking } = useVoiceStore.getState();
      setSpeaking('pk1', true);
      expect(useVoiceStore.getState().speakingPubkeys.has('pk1')).toBe(true);
      setSpeaking('pk1', false);
      expect(useVoiceStore.getState().speakingPubkeys.has('pk1')).toBe(false);
    });

    it('setSpeaking is idempotent (same set ref when state unchanged)', () => {
      const { setSpeaking } = useVoiceStore.getState();
      setSpeaking('pk1', true);
      const first = useVoiceStore.getState().speakingPubkeys;
      setSpeaking('pk1', true);
      expect(useVoiceStore.getState().speakingPubkeys).toBe(first);
    });

    it('removeParticipant clears the pubkey from speakingPubkeys', () => {
      const { setSpeaking, addParticipant, removeParticipant } = useVoiceStore.getState();
      addParticipant({ pubkey: 'pk1', muted: false, deafened: false, joinedAt: '' });
      setSpeaking('pk1', true);
      removeParticipant('pk1');
      expect(useVoiceStore.getState().speakingPubkeys.has('pk1')).toBe(false);
    });

    it('leaveVoice resets speakingPubkeys', () => {
      useVoiceStore.getState().setSpeaking('pk1', true);
      useVoiceStore.getState().leaveVoice();
      expect(useVoiceStore.getState().speakingPubkeys.size).toBe(0);
    });
  });

  describe('localMutedPubkeys', () => {
    it('toggleLocalMute flips and isLocalMuted reads', () => {
      const { toggleLocalMute, isLocalMuted } = useVoiceStore.getState();
      toggleLocalMute('pk1');
      expect(isLocalMuted('pk1')).toBe(true);
      toggleLocalMute('pk1');
      expect(isLocalMuted('pk1')).toBe(false);
    });

    it('removeParticipant does NOT clear local mute (survives rejoin)', () => {
      const { toggleLocalMute, addParticipant, removeParticipant } = useVoiceStore.getState();
      addParticipant({ pubkey: 'pk1', muted: false, deafened: false, joinedAt: '' });
      toggleLocalMute('pk1');
      removeParticipant('pk1');
      expect(useVoiceStore.getState().localMutedPubkeys.has('pk1')).toBe(true);
    });

    it('leaveVoice resets localMutedPubkeys', () => {
      useVoiceStore.getState().toggleLocalMute('pk1');
      useVoiceStore.getState().leaveVoice();
      expect(useVoiceStore.getState().localMutedPubkeys.size).toBe(0);
    });
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
