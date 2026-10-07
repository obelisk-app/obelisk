import { useMemo, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import type { VoiceClient } from '@/services/voice/client';
import type { VoiceErrorCode } from '@/services/voice/errors';
import { useVoiceStore } from '@/store/voice';
import { useActiveCall, useGroups, useCurrentRelayUrl, useMyLoginMethod } from '@/services/nostr-bridge';
import { shouldUseSfuTopology } from '@/services/voice/topology';
import { useVoiceRoomGate } from '@/hooks/voice/room/useVoiceRoomGate';
import { useVoiceRoomClient } from '@/hooks/voice/room/useVoiceRoomClient';
import { useStagePin } from '@/hooks/voice/room/useStagePin';
import {
  countMeshSyncing,
  groupTracksByPubkey,
  listScreenSharers,
  resolveStage,
  splitParticipants,
} from '@/utils/voice/stage-layout';
import { isVoiceDebugOn, passiveCallCount, voiceRoomDisplayName } from '@/utils/voice/room-view';

/**
 * The voice room's view model: the membership gate, the room's VoiceClient
 * (through `useVoiceRoomClient`), the stage layout worked out by the pure
 * rules in `stage-layout.ts`, and what the header and the pre-join landing
 * show (docs/conventions.md#component-files).
 */
export function useVoiceRoom(channelId: string, channelName: string | undefined) {
  const router = useRouter();
  const groups = useGroups();
  const currentRelayUrl = useCurrentRelayUrl();
  const loginMethod = useMyLoginMethod();
  const channelKind = useMemo(
    () => groups.find((g) => g.id === channelId)?.kind ?? null,
    [groups, channelId],
  );
  const currentVoiceChannelId = useVoiceStore((s) => s.currentVoiceChannelId);
  const activeCall = useActiveCall(channelId);
  const expectSfu = useMemo(
    () => shouldUseSfuTopology(channelKind, activeCall?.mode),
    [channelKind, activeCall?.mode],
  );
  // Shared by the gate (which pushes role changes into the running client)
  // and the client hook (which owns it).
  const clientRef = useRef<VoiceClient | null>(null);
  const [error, setError] = useState<VoiceErrorCode | null>(null);

  const { gate, selfPubkey } = useVoiceRoomGate(channelId, clientRef, setError);
  const {
    joined, join, leave, participants, remoteTracks, peerConnectionStates, local, localVideo, sfuStatus,
  } = useVoiceRoomClient({ channelId, clientRef, gate, expectSfu, activeCall, currentRelayUrl, loginMethod, setError });

  const [pinned, setPinned] = useStagePin(joined);

  const tracksByPubkey = useMemo(() => groupTracksByPubkey(remoteTracks), [remoteTracks]);

  // Keyed on the track, so toggling the mic no longer re-binds the camera preview.
  const localCamStream = useMemo(
    () => (localVideo.camera ? new MediaStream([localVideo.camera]) : null),
    [localVideo.camera],
  );
  const localScreenStream = useMemo(
    () => (localVideo.screen ? new MediaStream([localVideo.screen]) : null),
    [localVideo.screen],
  );

  const { videoPubkeys, audioPubkeys } = splitParticipants({
    selfPubkey, participants, localCamera: local.camera, tracks: tracksByPubkey,
  });
  const screenSharers = listScreenSharers({
    selfPubkey, participants, localScreen: !!(local.screen && localScreenStream), tracks: tracksByPubkey,
  });
  const activeStage = useMemo(
    () => resolveStage({ pinned, screenSharers, tracks: tracksByPubkey, selfPubkey, localCamStream, localScreenStream }),
    [pinned, screenSharers, tracksByPubkey, selfPubkey, localCamStream, localScreenStream],
  );
  const meshSyncingCount = useMemo(
    () => countMeshSyncing({ joined, expectSfu, participants, peerConnectionStates }),
    [joined, expectSfu, participants, peerConnectionStates],
  );

  return {
    gate,
    error,
    joined,
    join,
    leave,
    sfuStatus,
    meshSyncingCount,
    activeCall,
    /** Everyone in the call, me included. */
    totalCount: participants.length + 1,
    displayName: voiceRoomDisplayName(channelName, channelId),
    passiveCount: passiveCallCount(activeCall),
    passiveParticipantPubkeys: activeCall?.participantPubkeys ?? [],
    /** In another channel's call while looking at this one. */
    browsingWhileConnected: !!currentVoiceChannelId && currentVoiceChannelId !== channelId,
    debugOverlay: typeof window !== 'undefined' && isVoiceDebugOn(window.location.search),
    stage: { activeStage, pinned, setPinned, videoPubkeys, audioPubkeys, selfPubkey, localCamStream, tracksByPubkey },
    back: () => router.push('/app'),
  };
}
