'use client';

import { useGroups, useActiveCallByChannel } from '@/services/nostr-bridge';
import { useTranslations } from 'next-intl';
import { LazyVoiceRoom } from '../../lazy-mounts';
import BackButton from '../BackButton';

export function VoiceRoomScreen({ groupId, back, openChat }: { groupId: string; back: () => void; openChat: () => void }) {
  const t = useTranslations();
  const groups = useGroups();
  const group = groups.find((g) => g.id === groupId) ?? null;
  const activeCallByChannel = useActiveCallByChannel();
  const call = activeCallByChannel[groupId] ?? null;
  const isSfu = group?.kind === 'voice-sfu';
  // Status only shows once a call exists; the topology (SFU vs P2P) is now
  // expressed by the inline tag next to the title, so the subtitle stays
  // empty on the idle "no one's here" view instead of repeating "SFU room".
  const sub =
    call?.status === 'connected' ? 'Live · connected' :
    call?.status === 'starting' ? 'Starting…' :
    call?.status ? call.status :
    null;

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
            <span className="voice-room-name">{group?.name ?? 'Voice channel'}</span>
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

// ───────────────────────────────────────────────────────────────────────────
// 06 - DMs list
