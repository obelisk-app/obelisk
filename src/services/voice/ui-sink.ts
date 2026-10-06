/**
 * The one place the voice engine writes UI state.
 *
 * `VoiceClient` mirrors a handful of facts into the voice store so surfaces
 * outside the room (the sidebar status bar, the background audio sink, the
 * speaking orbs) can render without owning the client. Those writes used to
 * be sixteen `useVoiceStore.getState()` calls each wrapped in
 * `catch` blocks commented "test envs". The store is created at module load and
 * `getState()` cannot throw, so every one of those catches was dead code
 * that would also have swallowed a real exception thrown from a store
 * subscriber. The client now talks to this interface instead, with no
 * try/catch: a sink that throws is a bug that must be seen, and a test can
 * inject its own sink rather than reaching into the store.
 */
import { useVoiceStore } from '@/store/voice';
import type { VideoQuality } from './quality';
import type { QualitySample } from './stats';

export interface LocalTracksState {
  mic: boolean;
  camera: boolean;
  screen: boolean;
}

export interface VoiceUiSink {
  /** A roster or signal subscription is backing off after a rate-limit CLOSE. */
  setSignalingDegraded(degraded: boolean): void;
  /** `pubkey` crossed the speaking threshold (or fell silent). */
  setSpeaking(pubkey: string, speaking: boolean): void;
  /** Drop every per-peer local mute; used when the call ends. */
  clearLocalMutes(): void;
  /** Mute or unmute one peer for the local listener only. */
  setPeerMuted(pubkey: string, muted: boolean): void;
  setPeerQuality(pubkey: string, sample: QualitySample): void;
  clearPeerQuality(pubkey: string): void;
  /** A user-facing error the room should surface. */
  setError(message: string): void;
  /** Mirror of the client's local track state (mic enabled = not muted). */
  setLocalTracks(local: LocalTracksState): void;
  /** The user's persisted quality preferences, read when a track or peer is set up. */
  readVideoQuality(): { videoQuality: VideoQuality; receivedVideoQuality: VideoQuality };
}

/** Production sink: the zustand voice store. */
export const voiceStoreSink: VoiceUiSink = {
  setSignalingDegraded: (degraded) => useVoiceStore.getState().setSignalingDegraded(degraded),
  setSpeaking: (pubkey, speaking) => useVoiceStore.getState().setSpeaking(pubkey, speaking),
  clearLocalMutes: () => useVoiceStore.getState().clearLocalMutes(),
  setPeerMuted: (pubkey, muted) => {
    const s = useVoiceStore.getState();
    if (muted) s.muteLocally(pubkey);
    else s.unmuteLocally(pubkey);
  },
  setPeerQuality: (pubkey, sample) => useVoiceStore.getState().setPeerQuality(pubkey, sample),
  clearPeerQuality: (pubkey) => useVoiceStore.getState().clearPeerQuality(pubkey),
  setError: (message) => useVoiceStore.getState().setError(message),
  setLocalTracks: (local) => {
    const s = useVoiceStore.getState();
    s.setMuted(!local.mic);
    s.setCameraOn(local.camera);
    s.setScreenSharing(local.screen);
  },
  readVideoQuality: () => {
    const s = useVoiceStore.getState();
    return { videoQuality: s.videoQuality, receivedVideoQuality: s.receivedVideoQuality };
  },
};

/**
 * A sink that records nothing and answers `auto` for both quality
 * preferences. For tests that construct a `VoiceClient` and do not care
 * about UI mirroring.
 */
export function silentVoiceUiSink(): VoiceUiSink {
  return {
    setSignalingDegraded: () => {},
    setSpeaking: () => {},
    clearLocalMutes: () => {},
    setPeerMuted: () => {},
    setPeerQuality: () => {},
    clearPeerQuality: () => {},
    setError: () => {},
    setLocalTracks: () => {},
    readVideoQuality: () => ({ videoQuality: 'auto', receivedVideoQuality: 'auto' }),
  };
}
