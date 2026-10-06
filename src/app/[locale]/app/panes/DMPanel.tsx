'use client';

import DMThreadMenu from '@/components/chat/DMThreadMenu';
import { Fragment, useEffect } from 'react';
import PqShield from '@/components/chat/PqShield';
import PqMessageMark from '@/components/chat/PqMessageMark';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { guidePath } from '@/utils/guides/guide-urls';
import { DmComposer } from '@/components/chat/DmComposer';
import { DmCallButtons } from '@/components/call/DmCallButtons';
import { DmMessageBody } from '@/components/chat/DmMessageBody';
import { DM_BUBBLE_MENU_GUTTER, DmMessageMenu } from '@/components/chat/DmMessageMenu';
import { useChatStore } from '@/store/chat';
import { useDMStore } from '@/store/dm';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/i18n/useFormat';
import { useDmThread, useDmThreadScroll } from '@/hooks/chat/useDmThread';
import { Avatar } from '../Avatar';
import Button from '@/components/ui/Button';
import CloseButton from '@/components/ui/CloseButton';
import { DmProtocolNotice, DmProtocolSwitch } from '../dm-protocol/DmProtocolSwitch';
import { useDmProtocolChoice } from '@/hooks/app/dm-protocol/useDmProtocolChoice';

// Exported for tests only - mounted internally by `AppShell`, same as
// `RelayTopBar` / `SidebarMe`. The conversation itself (order, dividers,
// post-quantum marks, retry, scroll) is `useDmThread`, shared with the phone's
// `DmThreadScreen`; this file is the desktop paint.
export function DMPanel({ peer }: { peer: string | null; onPickPeer: (p: string) => void }) {
  const { formatTime } = useFormat();
  const t = useTranslations();
  const thread = useDmThread(peer);
  const scrollRef = useDmThreadScroll(peer, thread.messages.length);
  const protocolChoice = useDmProtocolChoice(peer);
  // Mirror the open peer into the DM store so `isUserWatchingDM` reflects
  // desktop's "I'm reading this conversation" state. Without this, the
  // read-state cursor never advances on desktop and unread badges leak in.
  // (The phone shell sets this from its navigation state instead.)
  useEffect(() => {
    useDMStore.setState({ activeDMPubkey: peer });
    return () => {
      // Clear when the panel unmounts (user navigated away from DMs).
      if (useDMStore.getState().activeDMPubkey === peer) {
        useDMStore.setState({ activeDMPubkey: null });
      }
    };
  }, [peer]);

  if (!peer) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-lc-muted">
        {t('dm.pickConversation')}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Fixed height, matching the DM list header (`DMList`) so their
          bottom borders line up; padding-derived height drifted from it. */}
      <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-lc-border bg-lc-dark px-5" data-testid="dm-thread-header">
        <button
          type="button"
          onClick={(event) => useChatStore.getState().openProfilePopup(peer, { x: event.clientX, y: event.clientY })}
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
        </button>
        <span className="ml-auto flex items-center gap-1">
          <DmProtocolSwitch choice={protocolChoice} className="mr-1" />
          <DmCallButtons peer={peer} />
          <PqShield level={thread.protection} guideHref={guidePath('quantum-safe-dms')} />
          {/* Beside the shield, not instead of it - the shield is state the
              header has to keep saying out loud. */}
          <DMThreadMenu
            peer={peer}
            onOpenProfile={(pubkey) => useChatStore.getState().openProfilePopup(pubkey, { x: 0, y: 0 })}
          />
        </span>
      </header>
      <DmProtocolNotice choice={protocolChoice} />
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        {thread.items.length === 0 ? (
          <div className="text-sm text-lc-muted">{t('dm.emptyEncrypted')}</div>
        ) : (
          thread.items.map((it) => it.type === 'divider' ? (
            // A divider whenever the calendar day changes. Without these the
            // panel was one unbroken column - a conversation held over three
            // weeks read as a single sitting.
            <div key={it.key} className="my-3 flex items-center gap-3" data-testid="dm-day-divider">
              <span className="h-px flex-1 bg-lc-border" />
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-lc-muted">{it.label}</span>
              <span className="h-px flex-1 bg-lc-border" />
            </div>
          ) : (
            <Fragment key={it.key}>
              <div
                className={
                  `relative mb-2 max-w-md rounded-2xl py-2 pl-4 ${DM_BUBBLE_MENU_GUTTER} text-sm shadow-sm ` +
                  (it.msg.outgoing
                    ? 'ml-auto bg-lc-green text-lc-black'
                    : 'bg-lc-card text-lc-white') +
                  (it.msg.pending ? ' opacity-60' : '') +
                  (it.msg.failed ? ' ring-1 ring-red-500/60' : '')
                }
              >
                <DmMessageMenu message={it.msg} />
                <DmMessageBody message={it.msg} />
                <div className={'mt-1 flex items-center justify-end gap-1.5 text-[10px] ' + (it.msg.outgoing ? 'text-black/60' : 'text-lc-muted')}>
                  {/* `onAccent` because the outgoing bubble is `bg-lc-green`:
                      the default `text-lc-muted` is ~2:1 against it. This row
                      already switches the timestamp the same way. */}
                  <PqMessageMark mark={thread.marks[it.index] ?? null} onAccent={it.msg.outgoing} />
                  {it.msg.pending && (
                    <span
                      className={'inline-block h-2.5 w-2.5 animate-spin rounded-full border ' + (it.msg.outgoing ? 'border-black/30 border-t-black/70' : 'border-lc-muted/40 border-t-lc-muted')}
                      aria-label={t('common.sending')}
                      role="status"
                    />
                  )}
                  <span>{formatTime(it.msg.createdAt)}</span>
                </div>
                {it.msg.failed && it.msg.clientTag && (
                  <div className="mt-1.5 flex items-center justify-end gap-2 text-[11px] text-red-500" data-testid="dm-failed">
                    <span>{t('dm.failedSend')}</span>
                    <Button
                      variant="outline"
                      tone="danger"
                      size="xs"
                      onClick={() => thread.retry(it.msg.clientTag!)}
                      data-testid="dm-retry"
                    >
                      {t('common.retry')}
                    </Button>
                    <CloseButton
                      size="sm"
                      onClick={() => thread.dismiss(it.msg.clientTag!)}
                      label={t('dm.dismissFailed')}
                      className="-my-1 text-red-500/70 hover:bg-red-500/10 hover:text-red-500"
                    />
                  </div>
                )}
              </div>
            </Fragment>
          ))
        )}
      </div>
      {/* The channel's message bar, with every file and voice note
          encrypted before upload - see `DmComposer`. */}
      <DmComposer key={peer} peer={peer} variant="desktop" />
    </div>
  );
}
