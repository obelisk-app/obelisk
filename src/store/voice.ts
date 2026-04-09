import { create } from 'zustand';
import type { VoiceParticipant } from '@/lib/voice';

interface VoiceState {
  currentVoiceChannelId: string | null;
  voiceParticipants: VoiceParticipant[];
  isMuted: boolean;
  isDeafened: boolean;
  isConnecting: boolean;

  setVoiceChannel: (channelId: string | null) => void;
  setParticipants: (participants: VoiceParticipant[]) => void;
  addParticipant: (participant: VoiceParticipant) => void;
  removeParticipant: (pubkey: string) => void;
  updateParticipant: (pubkey: string, updates: Partial<VoiceParticipant>) => void;
  setMuted: (muted: boolean) => void;
  setDeafened: (deafened: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  leaveVoice: () => void;
}

export const useVoiceStore = create<VoiceState>()((set) => ({
  currentVoiceChannelId: null,
  voiceParticipants: [],
  isMuted: false,
  isDeafened: false,
  isConnecting: false,

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
  leaveVoice: () => set({
    currentVoiceChannelId: null,
    voiceParticipants: [],
    isMuted: false,
    isDeafened: false,
    isConnecting: false,
  }),
}));
