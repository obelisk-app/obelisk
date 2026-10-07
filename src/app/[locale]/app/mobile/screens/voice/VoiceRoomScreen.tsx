'use client';

import { useTranslations } from 'next-intl';
import { LazyVoiceRoom } from '../../../mounts/lazy-mounts';
import BackButton from '../../chrome/BackButton';
import { useVoiceRoomScreen } from '@/hooks/shell/mobile/screens/voice/useVoiceRoomScreen';
import { MicCapsuleIcon, MinusIcon } from '@/assets/icons';

export function VoiceRoomScreen({ groupId, back, openChat }: { groupId: string; back: () => void; openChat: () => void }) {
  const t = useTranslations();
  const { group, isSfu, sub } = useVoiceRoomScreen(groupId);

  return (
    <div className="screen voice-room-screen active" data-screen="voice-room">
      <div className="voice-room-topbar">
        <BackButton onClick={back} />
        <div className="voice-room-meta">
          <div className="voice-room-title">
            <MicCapsuleIcon size={null} className="voice-room-mic-glyph" />
            <span className="voice-room-name">{group?.name ?? t('mobile.voice.fallbackName')}</span>
            {isSfu && <span className="voice-sfu-pill" title={t('mobile.voice.sfuTitle')}>SFU</span>}
          </div>
          {sub && <div className="voice-room-sub">{sub}</div>}
        </div>
        <button className="back-btn" onClick={back} aria-label={t('mobile.voice.minimize')} data-testid="minimize-call-btn">
          <MinusIcon size={null} strokeWidth={2} />
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

