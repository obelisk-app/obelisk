'use client';

/**
 * Voice channel room. Owns one VoiceClient (through `useVoiceRoomClient`)
 * and renders a stage layout:
 *  - When someone is sharing screen, the share takes the canvas and cams
 *    collapse to a side rail (desktop) / horizontal strip (mobile).
 *  - Otherwise, video tiles fill the canvas in a responsive grid.
 *  - Audio-only participants show as a compact horizontal strip.
 *  - A floating control pill sits over the stage.
 *
 * Authorization: `useVoiceRoomGate` subscribes to NIP-29 admins (39001)
 * and members (39002). The layout rules are the pure functions in
 * `room/stage-layout.ts`.
 */
import { useMemo, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import type { VoiceClient } from '@/services/voice/client';
import type { VoiceErrorCode } from '@/services/voice/errors';
import { useVoiceStore } from '@/store/voice';
import { useActiveCall, useGroups, useCurrentRelayUrl, useMyLoginMethod } from '@/services/nostr-bridge';
import { shouldUseSfuTopology } from '@/services/voice/topology';
import VoiceControls from './VoiceControls';
import { DebugOverlay } from './DebugOverlay';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import { CenteredPanel, Spinner, StageBackdrop } from './room/chrome';
import { MeshSyncStatusPill, RoomHeader } from './room/header';
import { JoinLanding } from './room/JoinLanding';
import { StageArea } from './room/StageArea';
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

// `MeshSyncStatusPill` keeps its historical import path.
export { MeshSyncStatusPill };

interface Props {
  channelId: string;
  channelName?: string;
  chatSlot?: React.ReactNode;
  isChatOpen?: boolean;
  onToggleChat?: () => void;
}

export default function VoiceRoom({ channelId, channelName, chatSlot, isChatOpen, onToggleChat }: Props) {
  const t = useTranslations();
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

  if (gate.phase === 'init' || gate.phase === 'loading-roles') {
    return (
      <CenteredPanel>
        <Spinner />
        <div className="mt-3 text-sm text-neutral-300">{t('voice.loadingMembership')}</div>
        <div className="mt-1 font-mono text-xs text-neutral-500 break-all">{channelId}</div>
        {error && <div className="mt-3 text-xs text-red-400">{t(`voice.error.${error}`)}</div>}
      </CenteredPanel>
    );
  }
  if (gate.phase === 'not-a-member') {
    return (
      <CenteredPanel>
        <div className="text-lg font-semibold">{t('voice.notMember')}</div>
        <div className="mt-2 text-sm text-neutral-400">{t('voice.notMemberHelp')}</div>
        <div className="mt-4 font-mono text-xs text-neutral-500 break-all">{channelId}</div>
        <Button variant="pillSecondary" size="sm" className="mt-6" onClick={() => router.push('/app')}>
          {t('common.back')}
        </Button>
      </CenteredPanel>
    );
  }

  const totalCount = participants.length + 1;
  const displayName = channelName ?? `${channelId.slice(0, 16)}…`;
  const passiveParticipantPubkeys = activeCall?.participantPubkeys ?? [];
  const passiveCount = activeCall
    ? Math.max(
        activeCall.participantCount > 0 ? activeCall.participantCount : 0,
        passiveParticipantPubkeys.length,
      )
    : 0;
  const browsingWhileConnected = !!currentVoiceChannelId && currentVoiceChannelId !== channelId;

  if (!joined) {
    return (
      <JoinLanding
        displayName={displayName}
        activeCall={activeCall}
        passiveCount={passiveCount}
        passiveParticipantPubkeys={passiveParticipantPubkeys}
        browsingWhileConnected={browsingWhileConnected}
        onJoin={join}
        error={error}
        chatSlot={chatSlot}
        isChatOpen={isChatOpen}
      />
    );
  }

  const debugOverlay = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('debug') === 'voice';

  return (
    <div className="relative flex-1 flex min-h-0 p-2 sm:p-3 gap-2" data-testid="voice-channel">
      {debugOverlay && <DebugOverlay />}
      <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden rounded-2xl border border-lc-border bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-800 shadow-2xl">
        <StageBackdrop />
        <RoomHeader name={displayName} count={totalCount} sfuStatus={sfuStatus} meshSyncingCount={meshSyncingCount} />

        <StageArea
          activeStage={activeStage}
          pinned={pinned}
          setPinned={setPinned}
          videoPubkeys={videoPubkeys}
          audioPubkeys={audioPubkeys}
          selfPubkey={selfPubkey}
          localCamStream={localCamStream}
          tracksByPubkey={tracksByPubkey}
        />

        {/* Floating control pill */}
        <div className="absolute left-0 right-0 bottom-3 sm:bottom-4 z-20 flex justify-center pointer-events-none px-2">
          <VoiceControls onLeave={leave} isChatOpen={isChatOpen} onToggleChat={onToggleChat} />
        </div>
      </div>

      {chatSlot && isChatOpen && (
        <div className="contents max-md:!block max-md:absolute max-md:inset-0 max-md:z-30 max-md:bg-lc-black/80 max-md:backdrop-blur-sm">
          {chatSlot}
        </div>
      )}
    </div>
  );
}
