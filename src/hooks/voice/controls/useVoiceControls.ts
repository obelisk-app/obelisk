import { useEffect, useState } from 'react';
import { useVoiceStore } from '@/store/voice';
import { watchMultipleCameras } from '@/services/voice/camera-watch';
import {
  switchVoiceCamera, toggleVoiceCamera, toggleVoiceDeafen, toggleVoiceMic, toggleVoiceScreenShare,
} from '@/services/voice/call-controls';

/**
 * The room's floating control bar's view model: the call's state and error
 * from the voice store, whether to offer the camera flip, and the toggles
 * (docs/conventions.md#component-files).
 */
export function useVoiceControls() {
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isDeafened = useVoiceStore((s) => s.isDeafened);
  const isCameraOn = useVoiceStore((s) => s.isCameraOn);
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing);
  const error = useVoiceStore((s) => s.error);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  useEffect(() => watchMultipleCameras(setHasMultipleCameras), []);

  return {
    isMuted,
    isDeafened,
    isCameraOn,
    isScreenSharing,
    error,
    showSwitchCamera: isCameraOn && hasMultipleCameras,
    toggleMute: () => void toggleVoiceMic(isMuted),
    toggleDeafen: () => {
      // Deafen is already applied; a mic that will not stop is the one
      // thing here worth hearing about, since it stays live.
      toggleVoiceDeafen(isDeafened, isMuted).catch((e) => console.warn('[voice] mic did not stop on deafen', e));
    },
    toggleCamera: () => void toggleVoiceCamera(isCameraOn),
    switchCamera: () => void switchVoiceCamera(),
    toggleScreenShare: () => void toggleVoiceScreenShare(isScreenSharing),
  };
}

export type VoiceControlsModel = ReturnType<typeof useVoiceControls>;
