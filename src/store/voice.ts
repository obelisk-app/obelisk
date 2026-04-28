import { create } from 'zustand';
import type { VoiceParticipant } from '@/lib/voice';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed';

interface VoiceState {
  currentVoiceChannelId: string | null;
  voiceParticipants: VoiceParticipant[];
  isMuted: boolean;
  isDeafened: boolean;
  isConnecting: boolean;
  connectionState: ConnectionState;
  error: string | null;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  // Track which remote peers have camera/screen active
  remoteVideos: Set<string>;   // pubkeys with camera on
  remoteScreens: Set<string>;  // pubkeys sharing screen
  // Video element refs (non-reactive maps, mutated in place)
  videoElements: Map<string, HTMLVideoElement>;   // pubkey → camera element
  screenElements: Map<string, HTMLVideoElement>;  // pubkey → screen element
  localCameraStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  focusedPubkey: string | null;
  limitNotice: string | null;
  // Pubkeys currently producing voice audio (real VAD, not !muted).
  speakingPubkeys: Set<string>;
  // Pubkeys the current viewer has silenced locally. Does not affect others.
  localMutedPubkeys: Set<string>;
  // Whether the voice channel's companion chat rail is visible. Hoisted into
  // the store (not component-local) so the toggle button in the voice view
  // and the rail itself — rendered as a sibling at the page level so its
  // header lines up with the channel title bar — can share one state flag.
  isVoiceChatOpen: boolean;

  setVoiceChannel: (channelId: string | null) => void;
  setParticipants: (participants: VoiceParticipant[]) => void;
  addParticipant: (participant: VoiceParticipant) => void;
  removeParticipant: (pubkey: string) => void;
  updateParticipant: (pubkey: string, updates: Partial<VoiceParticipant>) => void;
  setMuted: (muted: boolean) => void;
  setDeafened: (deafened: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setConnectionState: (state: ConnectionState) => void;
  setError: (error: string | null) => void;
  setCameraOn: (on: boolean) => void;
  setScreenSharing: (on: boolean) => void;
  addRemoteVideo: (pubkey: string, element?: HTMLVideoElement) => void;
  removeRemoteVideo: (pubkey: string) => void;
  addRemoteScreen: (pubkey: string, element?: HTMLVideoElement) => void;
  removeRemoteScreen: (pubkey: string) => void;
  setLocalCameraStream: (stream: MediaStream | null) => void;
  setLocalScreenStream: (stream: MediaStream | null) => void;
  setFocusedPubkey: (pubkey: string | null) => void;
  setLimitNotice: (msg: string | null) => void;
  setSpeaking: (pubkey: string, speaking: boolean) => void;
  toggleLocalMute: (pubkey: string) => void;
  isLocalMuted: (pubkey: string) => boolean;
  setVoiceChatOpen: (open: boolean) => void;
  leaveVoice: () => void;
}

// Indirection so `isLocalMuted` can read the current store without creating
// a circular reference inside `create()` — TypeScript can't infer the store
// type while the initializer references the store symbol directly.
function getLocalMutedSet(): Set<string> {
  return useVoiceStore.getState().localMutedPubkeys;
}

export const useVoiceStore = create<VoiceState>()((set) => ({
  currentVoiceChannelId: null,
  voiceParticipants: [],
  isMuted: false,
  isDeafened: false,
  isConnecting: false,
  connectionState: 'disconnected',
  error: null,
  isCameraOn: false,
  isScreenSharing: false,
  remoteVideos: new Set<string>(),
  remoteScreens: new Set<string>(),
  videoElements: new Map<string, HTMLVideoElement>(),
  screenElements: new Map<string, HTMLVideoElement>(),
  localCameraStream: null,
  localScreenStream: null,
  focusedPubkey: null,
  limitNotice: null,
  speakingPubkeys: new Set<string>(),
  localMutedPubkeys: new Set<string>(),
  isVoiceChatOpen: false,

  setVoiceChannel: (channelId) => set({ currentVoiceChannelId: channelId }),
  setParticipants: (participants) => set({ voiceParticipants: participants }),
  addParticipant: (participant) => set((state) => ({
    voiceParticipants: [...state.voiceParticipants.filter(p => p.pubkey !== participant.pubkey), participant],
  })),
  removeParticipant: (pubkey) => set((state) => {
    // Avoid leaving a stale "speaking" orb on a departed peer. Local-mute
    // preference survives — if they rejoin in the same session, the viewer
    // probably still wants them silenced.
    const nextSpeaking = new Set(state.speakingPubkeys);
    nextSpeaking.delete(pubkey);
    return {
      voiceParticipants: state.voiceParticipants.filter(p => p.pubkey !== pubkey),
      speakingPubkeys: nextSpeaking,
    };
  }),
  updateParticipant: (pubkey, updates) => set((state) => ({
    voiceParticipants: state.voiceParticipants.map(p => p.pubkey === pubkey ? { ...p, ...updates } : p),
  })),
  setMuted: (muted) => set({ isMuted: muted }),
  setDeafened: (deafened) => set({ isDeafened: deafened }),
  setConnecting: (connecting) => set({ isConnecting: connecting }),
  setConnectionState: (connectionState) => set({ connectionState }),
  setError: (error) => set({ error }),
  setCameraOn: (isCameraOn) => set({ isCameraOn }),
  setScreenSharing: (isScreenSharing) => set({ isScreenSharing }),
  addRemoteVideo: (pubkey, element) => set((state) => {
    const next = new Set(state.remoteVideos);
    next.add(pubkey);
    if (element) state.videoElements.set(pubkey, element);
    return { remoteVideos: next };
  }),
  removeRemoteVideo: (pubkey) => set((state) => {
    const next = new Set(state.remoteVideos);
    next.delete(pubkey);
    state.videoElements.delete(pubkey);
    return { remoteVideos: next };
  }),
  addRemoteScreen: (pubkey, element) => set((state) => {
    const next = new Set(state.remoteScreens);
    next.add(pubkey);
    if (element) state.screenElements.set(pubkey, element);
    return { remoteScreens: next };
  }),
  removeRemoteScreen: (pubkey) => set((state) => {
    const next = new Set(state.remoteScreens);
    next.delete(pubkey);
    state.screenElements.delete(pubkey);
    return { remoteScreens: next };
  }),
  setLocalCameraStream: (stream) => set({ localCameraStream: stream }),
  setLocalScreenStream: (stream) => set({ localScreenStream: stream }),
  setFocusedPubkey: (focusedPubkey) => set({ focusedPubkey }),
  setLimitNotice: (limitNotice) => set({ limitNotice }),
  setSpeaking: (pubkey, speaking) => set((state) => {
    // Idempotent: the detector ticks at 20 Hz, so any per-tick no-op here
    // saves a full React re-render tree.
    const has = state.speakingPubkeys.has(pubkey);
    if (speaking === has) return {};
    const next = new Set(state.speakingPubkeys);
    if (speaking) next.add(pubkey); else next.delete(pubkey);
    return { speakingPubkeys: next };
  }),
  toggleLocalMute: (pubkey) => set((state) => {
    const next = new Set(state.localMutedPubkeys);
    if (next.has(pubkey)) next.delete(pubkey); else next.add(pubkey);
    return { localMutedPubkeys: next };
  }),
  isLocalMuted: (pubkey) => getLocalMutedSet().has(pubkey),
  setVoiceChatOpen: (open) => set({ isVoiceChatOpen: open }),
  leaveVoice: () => set((state) => {
    state.videoElements.clear();
    state.screenElements.clear();
    return {
    currentVoiceChannelId: null,
    voiceParticipants: [],
    isMuted: false,
    isDeafened: false,
    isConnecting: false,
    connectionState: 'disconnected',
    error: null,
    isCameraOn: false,
    isScreenSharing: false,
    remoteVideos: new Set<string>(),
    remoteScreens: new Set<string>(),
    localCameraStream: null,
    localScreenStream: null,
    focusedPubkey: null,
    limitNotice: null,
    speakingPubkeys: new Set<string>(),
    localMutedPubkeys: new Set<string>(),
    isVoiceChatOpen: false,
  }; }),
}));
