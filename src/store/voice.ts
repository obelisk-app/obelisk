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
  addRemoteVideo: (pubkey: string) => void;
  removeRemoteVideo: (pubkey: string) => void;
  addRemoteScreen: (pubkey: string) => void;
  removeRemoteScreen: (pubkey: string) => void;
  leaveVoice: () => void;
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

  setVoiceChannel: (channelId) => set({ currentVoiceChannelId: channelId }),
  setParticipants: (participants) => set({ voiceParticipants: participants }),
  addParticipant: (participant) => set((state) => ({
    voiceParticipants: [...state.voiceParticipants.filter(p => p.pubkey !== participant.pubkey), participant],
  })),
  removeParticipant: (pubkey) => set((state) => ({
    voiceParticipants: state.voiceParticipants.filter(p => p.pubkey !== pubkey),
  })),
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
  addRemoteVideo: (pubkey) => set((state) => {
    const next = new Set(state.remoteVideos);
    next.add(pubkey);
    return { remoteVideos: next };
  }),
  removeRemoteVideo: (pubkey) => set((state) => {
    const next = new Set(state.remoteVideos);
    next.delete(pubkey);
    return { remoteVideos: next };
  }),
  addRemoteScreen: (pubkey) => set((state) => {
    const next = new Set(state.remoteScreens);
    next.add(pubkey);
    return { remoteScreens: next };
  }),
  removeRemoteScreen: (pubkey) => set((state) => {
    const next = new Set(state.remoteScreens);
    next.delete(pubkey);
    return { remoteScreens: next };
  }),
  leaveVoice: () => set({
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
  }),
}));
