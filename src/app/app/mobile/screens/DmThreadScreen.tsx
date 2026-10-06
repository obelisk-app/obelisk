'use client';

import { avatarInitials } from '@/utils/identity/display-name';
import DMThreadMenu from '@/components/chat/DMThreadMenu';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import PqShield from '@/components/chat/PqShield';
import PqMessageMark from '@/components/chat/PqMessageMark';
import { guidesHref } from '@/utils/guides/guide-urls';
import { useTranslation } from '@/i18n/context';
import { DmComposer } from '@/components/chat/DmComposer';
import { DmCallButtons } from '@/components/call/DmCallButtons';
import { DmMessageBody } from '@/components/chat/DmMessageBody';
import { DmMessageMenu } from '@/components/chat/DmMessageMenu';
import { useDmThread, useDmThreadScroll } from '@/hooks/chat/useDmThread';
import { avatarStyle } from '../avatar';
import { timeOfDay } from '../labels';
import BackButton from '../BackButton';
import RemoteImage from '@/components/ui/RemoteImage';
import { DmProtocolNotice, DmProtocolSwitch } from '../../dm-protocol/DmProtocolSwitch';
import { useDmProtocolChoice } from '@/hooks/app/dm-protocol/useDmProtocolChoice';

/**
 * Phone skin of a DM conversation. Order, dividers, post-quantum marks,
 * retry and the stick-to-bottom scroll are `useDmThread`, shared with the
 * desktop `DMPanel`; mobile is a first-class surface here, not a reduced
 * one. This file owns the mobile classes only.
 */
export function DmThreadScreen({
  peer,
  back,
  openProfile,
}: {
  peer: string;
  back: () => void;
  openProfile: (pubkey: string) => void;
}) {
  const { t, locale } = useTranslation();
  const thread = useDmThread(peer);
  const scrollRef = useDmThreadScroll(peer, thread.messages.length);
  const protocolChoice = useDmProtocolChoice(peer);

  return (
    <div className="screen active" data-screen="dm-thread">
      <div className="dm-header">
        <BackButton onClick={back} />
        <div className="dm-ava-list" style={avatarStyle(peer)} onClick={() => openProfile(peer)}>
          {thread.meta?.picture ? <RemoteImage src={thread.meta.picture} alt="" /> : avatarInitials(thread.peerName, peer)}
        </div>
        <div className="dm-header-meta" onClick={() => openProfile(peer)}>
          <div className="dm-header-name">{thread.peerName}</div>
          <div className="dm-header-pubkey">
            <svg className="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="9" rx="1.5" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {shortNpubLabel(peer)} · <span data-testid="dm-header-protocol">{protocolChoice.protocol === 'nip04' ? 'NIP-04' : 'NIP-17'}</span>
            </span>
          </div>
        </div>
        {/* One icon, tapped rather than hovered on a phone. */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
          <DmCallButtons peer={peer} variant="mobile" />
          <PqShield level={thread.protection} guideHref={guidesHref(locale, 'quantum-safe-dms')} />
          {/* Beside the shield, not instead of it. */}
          <DMThreadMenu peer={peer} onOpenProfile={openProfile} />
        </div>
      </div>
      {/* Below the header, not in it: a phone header has no room left. */}
      <div className="dm-protocol-bar">
        <DmProtocolSwitch choice={protocolChoice} />
      </div>
      <DmProtocolNotice choice={protocolChoice} className="px-3.5" />

      <div className="dm-messages native-scroll-y" ref={scrollRef}>
        <div className="dm-encryption-pill">
          <svg className="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="9" rx="1.5" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          {t('dm.encryptedPill')}
        </div>
        {thread.items.map((it) =>
          it.type === 'divider' ? (
            <div key={it.key} className="day-divider">{it.label}</div>
          ) : (
            <div
              key={it.key}
              className={
                'dm-bubble '
                + (it.msg.outgoing ? 'outgoing delivered' : 'incoming')
                + (it.msg.pending ? ' pending' : '')
                + (it.msg.failed ? ' failed' : '')
              }
            >
              <DmMessageMenu message={it.msg} />
              <div className="dm-bubble-text"><DmMessageBody message={it.msg} /></div>
              <div className="dm-bubble-meta">
                {/* `onAccent` on outgoing: the bubble is `var(--accent)` with
                    `var(--accent-ink)` text, the same contrast trap as
                    desktop's `bg-lc-green`. */}
                <PqMessageMark mark={thread.marks[it.index] ?? null} onAccent={it.msg.outgoing} />
                {it.msg.pending && <span className="dm-bubble-spinner" aria-label={t('common.sending')} role="status" />}
                <span className="dm-bubble-time">{timeOfDay(it.msg.createdAt, locale)}</span>
              </div>
              {it.msg.failed && it.msg.clientTag && (
                <div className="dm-bubble-failed" data-testid="mobile-dm-failed">
                  <span className="dm-bubble-failed-label">{t('dm.failedSend')}</span>
                  <button
                    type="button"
                    className="dm-bubble-retry"
                    onClick={() => thread.retry(it.msg.clientTag!)}
                    data-testid="mobile-dm-retry"
                  >
                    {t('common.retry')}
                  </button>
                  <button
                    type="button"
                    className="dm-bubble-dismiss"
                    onClick={() => thread.dismiss(it.msg.clientTag!)}
                    aria-label={t('dm.dismissFailed')}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ),
        )}
      </div>

      <DmComposer key={peer} peer={peer} variant="mobile" />
    </div>
  );
}
