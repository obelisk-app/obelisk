'use client';

/**
 * The pre-join landing of a voice channel: who is already in the call
 * (from the bridge's kind 20078 detector), the Join button, and the error
 * from the last attempt. Pure presentation.
 */
import type { ActiveCallInfo } from '@/services/nostr-bridge';
import type { VoiceErrorCode } from '@/services/voice/errors';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import PassiveCallRoster from './PassiveCallRoster';
import StageBackdrop from './StageBackdrop';
import RoomHeader from './RoomHeader';

export function JoinLanding({
  displayName, activeCall, passiveCount, passiveParticipantPubkeys, browsingWhileConnected,
  onJoin, error, chatSlot, isChatOpen,
}: {
  displayName: string;
  activeCall: ActiveCallInfo | null;
  passiveCount: number;
  passiveParticipantPubkeys: readonly string[];
  /** The user is in another channel's call while looking at this one. */
  browsingWhileConnected: boolean;
  onJoin: () => void;
  error: VoiceErrorCode | null;
  chatSlot?: React.ReactNode;
  isChatOpen?: boolean;
}) {
  const t = useTranslations();
  return (
    <div className="relative flex-1 flex min-h-0 p-2 sm:p-3 gap-2" data-testid="voice-channel">
      <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden rounded-2xl border border-lc-border bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-800 shadow-2xl">
        <StageBackdrop />
        <RoomHeader name={displayName} count={passiveCount} />
        <div className="relative z-10 flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="mx-auto mb-5 w-16 h-16 rounded-2xl bg-lc-green/10 ring-1 ring-lc-green/30 flex items-center justify-center text-lc-green">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </div>
            <div className="text-xl font-semibold text-lc-white mb-1">{displayName}</div>
            <div className="text-sm text-lc-muted mb-5">
              {passiveCount > 0
                ? t('voice.landing.inCall', { count: passiveCount })
                : t(activeCall ? 'voice.landing.live' : 'voice.landing.empty')}
              {browsingWhileConnected && (
                <span className="block mt-1 text-lc-white/70">{t('voice.stayConnected')}</span>
              )}
            </div>
            <PassiveCallRoster
              pubkeys={passiveParticipantPubkeys}
              count={passiveCount}
              mode={activeCall?.mode}
            />
            <Button
              variant="pill"
              size="sm"
              onClick={onJoin}
              className="mt-6 shadow-lg shadow-lc-green/20"
              data-testid="join-voice-btn"
              data-tour="voice-join"
            >
              {t('voice.join')}
            </Button>
            {error && <div className="mt-4 text-xs text-red-300">{t(`voice.error.${error}`)}</div>}
          </div>
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
