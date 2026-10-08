import { useEffect, useState } from 'react';
import { useGroups } from '@/services/nostr-bridge';
import { useVoiceStore } from '@/store/voice';
import { requestVoiceJump } from '@/services/voice/jump-to-voice';
import { watchMultipleCameras } from '@/services/voice/camera-watch';
import { leaveActiveVoiceCall } from '@/services/voice/leave-active-call';
import {
  switchVoiceCamera, toggleVoiceCamera, toggleVoiceDeafenWarned, toggleVoiceMic, toggleVoiceScreenShare,
} from '@/services/voice/call-controls';
import { voiceChannelLabel } from '@/utils/voice/channel-label';

/**
 * The sidebar voice status bar's view model: the call's state from the
 * voice store, the channel's label, whether to offer the camera flip, and
 * the toggles, leave and jump-back handlers. `channelId` is null when there
 * is no call, and the bar then renders nothing
 * (docs/ui/conventions.md#component-files).
 */
export function useVoiceStatusBar() {
  const channelId = useVoiceStore((s) => s.currentVoiceChannelId);
  const relayUrl = useVoiceStore((s) => s.currentVoiceRelayUrl);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isDeafened = useVoiceStore((s) => s.isDeafened);
  const isCameraOn = useVoiceStore((s) => s.isCameraOn);
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing);
  const isSignalingDegraded = useVoiceStore((s) => s.isSignalingDegraded);
  const groups = useGroups();
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  useEffect(() => watchMultipleCameras(setHasMultipleCameras), []);

  return {
    channelId,
    channelLabel: channelId ? voiceChannelLabel(groups, channelId) : '',
    isMuted,
    isDeafened,
    isCameraOn,
    isScreenSharing,
    isSignalingDegraded,
    showSwitchCamera: isCameraOn && hasMultipleCameras,
    toggleMute: () => void toggleVoiceMic(isMuted),
    toggleDeafen: () => void toggleVoiceDeafenWarned(isDeafened, isMuted),
    toggleCamera: () => void toggleVoiceCamera(isCameraOn),
    switchCamera: () => void switchVoiceCamera(),
    toggleScreen: () => void toggleVoiceScreenShare(isScreenSharing),
    leave: () => void leaveActiveVoiceCall(),
    /**
     * Hand off to the AppShell-level subscriber. If the call's home relay
     * differs from the active bridge relay, the subscriber switches first so
     * `useGroups()` resolves the channel before the view is set.
     */
    jump: () => {
      if (channelId) requestVoiceJump({ channelId, relayUrl: relayUrl ?? null });
    },
  };
}

export type VoiceStatusBarModel = ReturnType<typeof useVoiceStatusBar>;
