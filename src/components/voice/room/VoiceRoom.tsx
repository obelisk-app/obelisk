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
 * `stage-layout.ts`; the state and layout come from `useVoiceRoom`.
 */
import VoiceControls from '../controls/VoiceControls';
import { DebugOverlay } from './DebugOverlay';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import CenteredPanel from './CenteredPanel';
import Spinner from './RoomSpinner';
import StageBackdrop from './StageBackdrop';
import MeshSyncStatusPill from './MeshSyncStatusPill';
import RoomHeader from './RoomHeader';
import { JoinLanding } from './JoinLanding';
import { StageArea } from './StageArea';
import { useVoiceRoom } from '@/hooks/voice/room/useVoiceRoom';

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
  const vm = useVoiceRoom(channelId, channelName);
  const { gate, error } = vm;

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
        <Button variant="pillSecondary" size="sm" className="mt-6" onClick={vm.back}>
          {t('common.back')}
        </Button>
      </CenteredPanel>
    );
  }

  if (!vm.joined) {
    return (
      <JoinLanding
        displayName={vm.displayName}
        activeCall={vm.activeCall}
        passiveCount={vm.passiveCount}
        passiveParticipantPubkeys={vm.passiveParticipantPubkeys}
        browsingWhileConnected={vm.browsingWhileConnected}
        onJoin={vm.join}
        error={error}
        chatSlot={chatSlot}
        isChatOpen={isChatOpen}
      />
    );
  }

  return (
    <div className="relative flex-1 flex min-h-0 p-2 sm:p-3 gap-2" data-testid="voice-channel">
      {vm.debugOverlay && <DebugOverlay />}
      <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden rounded-2xl border border-lc-border bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-800 shadow-2xl">
        <StageBackdrop />
        <RoomHeader name={vm.displayName} count={vm.totalCount} sfuStatus={vm.sfuStatus} meshSyncingCount={vm.meshSyncingCount} />

        <StageArea {...vm.stage} />

        {/* Floating control pill */}
        <div className="absolute left-0 right-0 bottom-3 sm:bottom-4 z-20 flex justify-center pointer-events-none px-2">
          <VoiceControls onLeave={vm.leave} isChatOpen={isChatOpen} onToggleChat={onToggleChat} />
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
