/**
 * Voice channel client for HiveTalk SFU WebRTC integration.
 *
 * This module manages the local media stream and communicates with the server
 * via Socket.io for signaling. The actual WebRTC peer connections are
 * established with the HiveTalk SFU server.
 */

export interface VoiceParticipant {
  pubkey: string;
  muted: boolean;
  deafened: boolean;
  joinedAt: string;
}

let localStream: MediaStream | null = null;

/**
 * Get microphone access and return the media stream.
 */
export async function getLocalAudioStream(): Promise<MediaStream> {
  if (localStream) return localStream;

  localStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });

  return localStream;
}

/**
 * Stop the local audio stream and release the microphone.
 */
export function stopLocalAudioStream(): void {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
}

/**
 * Mute/unmute the local audio stream.
 */
export function setLocalMuted(muted: boolean): void {
  if (localStream) {
    localStream.getAudioTracks().forEach(track => {
      track.enabled = !muted;
    });
  }
}

/**
 * Check if local audio is currently available.
 */
export function hasLocalStream(): boolean {
  return localStream !== null;
}
