'use client';

import { avatarInitials } from '@/utils/identity/display-name';
import DmThreadMenu from '@/components/chat/dm/thread/DmThreadMenu';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import PqShield from '@/components/chat/pq/PqShield';
import { guidePath } from '@/utils/guides/guide-urls';
import { useTranslations } from 'next-intl';
import { DmComposer } from '@/components/chat/dm/composer/DmComposer';
import { DmCallButtons } from '@/components/call/DmCallButtons';
import { useDmThread, useDmThreadScroll } from '@/hooks/chat/dm/thread/useDmThread';
import { avatarStyle } from '@/utils/shell/mobile/avatar-style';
import { markAt } from '@/utils/shell/mobile/dm-list';
import { DmThreadEntry } from './DmThreadEntry';
import BackButton from '../../chrome/BackButton';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { DmProtocolSwitch } from '../../../dm/DmProtocolSwitch';
import { DmProtocolNotice } from '../../../dm/DmProtocolNotice';
import { useDmProtocolChoice } from '@/hooks/shell/dm/useDmProtocolChoice';
import { DmUnlock } from '@/components/chat/dm/unlock/DmUnlock';

/**
 * Phone skin of a DM conversation. Order, dividers, post-quantum marks,
 * retry and the stick-to-bottom scroll are `useDmThread`, shared with the
 * desktop `DmPanel`; mobile is a first-class surface here, not a reduced
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
  const t = useTranslations();
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
          <PqShield level={thread.protection} guideHref={guidePath('quantum-safe-dms')} />
          {/* Beside the shield, not instead of it. */}
          <DmThreadMenu peer={peer} onOpenProfile={openProfile} />
        </div>
      </div>
      {/* Below the header, not in it: a phone header has no room left. */}
      <div className="dm-protocol-bar">
        <DmProtocolSwitch choice={protocolChoice} />
      </div>
      <DmUnlock />
      <DmProtocolNotice choice={protocolChoice} className="px-3.5" />

      <div className="dm-messages native-scroll-y" ref={scrollRef}>
        <div className="dm-encryption-pill">
          <svg className="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="9" rx="1.5" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          {t('dm.encryptedPill')}
        </div>
        {thread.items.map((it) => (
          <DmThreadEntry
            key={it.key}
            item={it}
            mark={markAt(thread.marks, it)}
            onRetry={thread.retry}
            onDismiss={thread.dismiss}
          />
        ))}
      </div>

      <DmComposer key={peer} peer={peer} variant="mobile" />
    </div>
  );
}
