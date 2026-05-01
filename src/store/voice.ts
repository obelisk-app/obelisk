import { create } from 'zustand';
import type { VideoQuality } from '@/lib/voice/quality';
import type { QualitySample } from '@/lib/voice/stats';

interface VoiceState {
  /** Channel id of the call we're currently in, or null if not in any call. */
  currentVoiceChannelId: string | null;
  /** Mic enabled? Mirror of VoiceClient.getLocalTracks().mic, kept in store so
   *  the sidebar status bar can re-render without owning the client. */
  isMuted: boolean;
  /** Output silenced (incoming audio not played). Local-only — does not
   *  affect what we publish. */
  isDeafened: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  isConnecting: boolean;
  error: string | null;
  /** Whether the right-side text-chat rail is visible inside the voice room. */
  isVoiceChatOpen: boolean;
  /** Outbound camera quality cap. Persisted to localStorage. */
  videoQuality: VideoQuality;
  /** Hint we send to peers to cap their outbound to us. Persisted. */
  receivedVideoQuality: VideoQuality;
  /** Per-peer connection-quality samples, keyed by remote pubkey. */
  peerQuality: Record<string, QualitySample>;

  setVoiceChannel: (channelId: string | null) => void;
  setMuted: (muted: boolean) => void;
  setDeafened: (deafened: boolean) => void;
  setCameraOn: (on: boolean) => void;
  setScreenSharing: (on: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setError: (error: string | null) => void;
  setVoiceChatOpen: (open: boolean) => void;
  setVideoQuality: (q: VideoQuality) => void;
  setReceivedVideoQuality: (q: VideoQuality) => void;
  setPeerQuality: (pubkey: string, sample: QualitySample) => void;
  clearPeerQuality: (pubkey: string) => void;
  /** Reset to defaults — called when the call ends. */
  leaveVoice: () => void;
}

const STORAGE_KEY = 'obelisk:voice:quality';

function loadPersisted(): { videoQuality: VideoQuality; receivedVideoQuality: VideoQuality } {
  if (typeof localStorage === 'undefined') return { videoQuality: 'auto', receivedVideoQuality: 'auto' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { videoQuality: 'auto', receivedVideoQuality: 'auto' };
    const parsed = JSON.parse(raw) as { videoQuality?: VideoQuality; receivedVideoQuality?: VideoQuality };
    return {
      videoQuality: parsed.videoQuality ?? 'auto',
      receivedVideoQuality: parsed.receivedVideoQuality ?? 'auto',
    };
  } catch {
    return { videoQuality: 'auto', receivedVideoQuality: 'auto' };
  }
}

function persist(state: { videoQuality: VideoQuality; receivedVideoQuality: VideoQuality }) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

const persisted = loadPersisted();

export const useVoiceStore = create<VoiceState>()((set, get) => ({
  currentVoiceChannelId: null,
  isMuted: false,
  isDeafened: false,
  isCameraOn: false,
  isScreenSharing: false,
  isConnecting: false,
  error: null,
  isVoiceChatOpen: false,
  videoQuality: persisted.videoQuality,
  receivedVideoQuality: persisted.receivedVideoQuality,
  peerQuality: {},

  setVoiceChannel: (currentVoiceChannelId) => set({ currentVoiceChannelId }),
  setMuted: (isMuted) => set({ isMuted }),
  setDeafened: (isDeafened) => set({ isDeafened }),
  setCameraOn: (isCameraOn) => set({ isCameraOn }),
  setScreenSharing: (isScreenSharing) => set({ isScreenSharing }),
  setConnecting: (isConnecting) => set({ isConnecting }),
  setError: (error) => set({ error }),
  setVoiceChatOpen: (isVoiceChatOpen) => set({ isVoiceChatOpen }),
  setVideoQuality: (videoQuality) => {
    set({ videoQuality });
    persist({ videoQuality, receivedVideoQuality: get().receivedVideoQuality });
  },
  setReceivedVideoQuality: (receivedVideoQuality) => {
    set({ receivedVideoQuality });
    persist({ videoQuality: get().videoQuality, receivedVideoQuality });
  },
  setPeerQuality: (pubkey, sample) =>
    set((s) => ({ peerQuality: { ...s.peerQuality, [pubkey]: sample } })),
  clearPeerQuality: (pubkey) =>
    set((s) => {
      if (!(pubkey in s.peerQuality)) return s;
      const next = { ...s.peerQuality };
      delete next[pubkey];
      return { peerQuality: next };
    }),
  leaveVoice: () =>
    set({
      currentVoiceChannelId: null,
      isMuted: false,
      isDeafened: false,
      isCameraOn: false,
      isScreenSharing: false,
      isConnecting: false,
      error: null,
      peerQuality: {},
    }),
}));
