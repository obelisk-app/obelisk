'use client';

import { useTranslations } from 'next-intl';
import { LazyVoiceRoom } from '../../../mounts/lazy-mounts';
import BackButton from '../../chrome/BackButton';
import { useVoiceRoomScreen } from '@/hooks/shell/mobile/screens/voice/useVoiceRoomScreen';

export function VoiceRoomScreen({ groupId, back, openChat }: { groupId: string; back: () => void; openChat: () => void }) {
  const t = useTranslations();
  const { group, isSfu, sub } = useVoiceRoomScreen(groupId);

  return (
    <div className="screen voice-room-screen active" data-screen="voice-room">
      <div className="voice-room-topbar">
        <BackButton onClick={back} />
        <div className="voice-room-meta">
          <div className="voice-room-title">
            <svg className="voice-room-mic-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
            <span className="voice-room-name">{group?.name ?? t('mobile.voice.fallbackName')}</span>
            {isSfu && <span className="voice-sfu-pill" title={t('mobile.voice.sfuTitle')}>SFU</span>}
          </div>
          {sub && <div className="voice-room-sub">{sub}</div>}
        </div>
        <button className="back-btn" onClick={back} aria-label={t('mobile.voice.minimize')} data-testid="minimize-call-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 12h12" /></svg>
        </button>
      </div>
      <div className="voice-room-stage">
        <LazyVoiceRoom
          channelId={groupId}
          channelName={group?.name ?? undefined}
          chatSlot={null}
          isChatOpen={false}
          onToggleChat={openChat}
        />
      </div>
    </div>
  );
}

