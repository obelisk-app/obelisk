'use client';

import Button from '@/components/ui/buttons/Button';
import DmThreadMenu from '@/components/chat/dm/thread/DmThreadMenu';
import PqShield from '@/components/chat/pq/PqShield';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { guidePath } from '@/utils/guides/guide-urls';
import { DmComposer } from '@/components/chat/dm/composer/DmComposer';
import { DmCallButtons } from '@/components/call/DmCallButtons';
import { useTranslations } from 'next-intl';
import { useDmPanel } from '@/hooks/shell/panes/dm/useDmPanel';
import { Avatar } from '../../desktop/Avatar';
import { DmProtocolSwitch } from '../../dm/DmProtocolSwitch';
import { DmProtocolNotice } from '../../dm/DmProtocolNotice';
import { DmUnlock } from '@/components/chat/dm/unlock/DmUnlock';
import { DmThreadItem } from './DmThreadItem';

// Exported for tests only - mounted internally by `AppShell`, same as
// `RelayTopBar` / `SidebarMe`. The conversation itself (order, dividers,
// post-quantum marks, retry, scroll) is `useDmThread`, shared with the phone's
// `DmThreadScreen`; this file is the desktop paint, its state from `useDmPanel`.
export function DmPanel({ peer }: { peer: string | null; onPickPeer: (p: string) => void }) {
  const t = useTranslations();
  const { thread, scrollRef, protocolChoice, openPeerProfile, openProfile } = useDmPanel(peer);

  if (!peer) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-lc-muted">
        {t('dm.pickConversation')}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Fixed height, matching the DM list header (`DmList`) so their
          bottom borders line up; padding-derived height drifted from it. */}
      <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-lc-border bg-lc-dark px-5" data-testid="dm-thread-header">
        <Button
          variant="bare"
          type="button"
          onClick={openPeerProfile}
          className="flex min-w-0 items-center gap-3 rounded-lg text-left hover:opacity-80"
        >
          <Avatar pubkey={peer} size={9} picture={thread.meta?.picture ?? null} />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-lc-white">{thread.peerName}</div>
            {/* An npub, not the raw 64 hex characters. The full key was
                rendered here in full, which is unreadable, unverifiable at a
                glance and the widest thing in the header. */}
            <div className="truncate font-mono text-[10px] text-lc-muted">
              {thread.meta?.nip05 ?? shortNpubLabel(peer)}
            </div>
          </div>
        </Button>
        <span className="ml-auto flex items-center gap-1">
          <DmProtocolSwitch choice={protocolChoice} className="mr-1" />
          <DmCallButtons peer={peer} />
          <PqShield level={thread.protection} guideHref={guidePath('quantum-safe-dms')} />
          {/* Beside the shield, not instead of it - the shield is state the
              header has to keep saying out loud. */}
          <DmThreadMenu
            peer={peer}
            onOpenProfile={openProfile}
          />
        </span>
      </header>
      <DmUnlock className="shrink-0 border-b border-lc-border" />
      <DmProtocolNotice choice={protocolChoice} />
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        {thread.items.length === 0 ? (
          <div className="text-sm text-lc-muted">{t('dm.emptyEncrypted')}</div>
        ) : (
          thread.items.map((it) => <DmThreadItem key={it.key} item={it} thread={thread} />)
        )}
      </div>
      {/* The channel's message bar, with every file and voice note
          encrypted before upload - see `DmComposer`. */}
      <DmComposer key={peer} peer={peer} variant="desktop" />
    </div>
  );
}
