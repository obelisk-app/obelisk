'use client';

import { createPortal } from 'react-dom';
import { MentionText } from '@/components/chat/mentions/MentionText';
import {
  isDmNotificationRead,
  isMentionRead,
  type DmNotification,
  type MentionNotification,
} from '@/store/notifications';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/i18n/useFormat';
import type { InboxStreams } from '@/hooks/shell/panes/topbar/useTopBarPopovers';
import SegmentedControl from '@/components/ui/forms/SegmentedControl';

/** The bell's popover: mentions on this relay and DMs, each with its own read cursor. */
export function InboxPopover({ inbox, onMentionClick, onDmClick, onOpenDms }: {
  inbox: InboxStreams;
  onMentionClick: (m: MentionNotification) => void;
  onDmClick: (d: DmNotification) => void;
  /** The locked DMs row: open the DMs, which unlocks them. */
  onOpenDms: () => void;
}) {
  const t = useTranslations();
  const { formatTime } = useFormat();
  const { notifTab, setNotifTab, mentions, mentionCursor, dmNotifications, dmCursor, tabHasItems, tabUnread, lockedDms } = inbox;
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      data-notif-popover
      className="fixed right-2 md:right-3 top-[3.75rem] md:top-11 z-[60] w-[min(380px,calc(100vw-1rem))] max-h-[70vh] overflow-hidden rounded-xl border border-lc-border bg-lc-dark shadow-2xl flex flex-col"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-lc-border">
        <span className="text-sm font-semibold text-lc-white">{t('common.notifications')}</span>
        {/* Pill affordances, per the La Crypta 9999px-radius convention.
            "Mark read" is an outlined accent pill so it stays secondary
            to the solid green unread badges in the tab strip below;
            "Clear" is neutral because it is destructive-ish and should
            not invite a reflexive click. */}
        <div className="flex items-center gap-1.5">
          {tabHasItems && tabUnread > 0 && (
            <button
              onClick={inbox.handleMarkRead}
              data-testid="notif-mark-read"
              className="rounded-full border border-lc-green/40 bg-lc-green/10 px-2.5 py-1 text-[11px] font-semibold leading-none text-lc-green transition-colors hover:border-lc-green/70 hover:bg-lc-green/20"
              title={notifTab === 'mentions'
                ? t('shell.desktop.inbox.markReadMentionsTitle')
                : t('shell.desktop.inbox.markReadDmsTitle')}
            >
              {t('shell.desktop.inbox.markRead')}
            </button>
          )}
          {tabHasItems && (
            <button
              onClick={inbox.handleClear}
              data-testid="notif-clear"
              className="rounded-full border border-lc-border bg-lc-card px-2.5 py-1 text-[11px] font-medium leading-none text-lc-muted transition-colors hover:border-lc-muted/50 hover:text-lc-white"
              title={t('common.clear')}
            >
              {t('common.clear')}
            </button>
          )}
        </div>
      </div>
      <div className="px-2 py-2 border-b border-lc-border" data-testid="notif-tabs" data-tour="inbox-tabs">
        <SegmentedControl
          fit="fill"
          aria-label={t('common.notifications')}
          value={notifTab}
          onChange={setNotifTab}
          options={(['mentions', 'dms'] as const).map((key) => {
            const count = key === 'mentions' ? inbox.unreadMentions : inbox.unreadDms;
            return {
              value: key,
              testId: `notif-tab-${key}`,
              label: (
                <>
                  {key === 'mentions' ? t('shell.inbox.tab.mentions') : t('shell.inbox.tab.dms')}
                  {/* Ink-on-green on the selected segment, green-on-ink otherwise. */}
                  {count > 0 && (
                    <span
                      className={`min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center leading-none ${
                        notifTab === key ? 'bg-lc-black text-lc-green' : 'bg-lc-green text-lc-black'
                      }`}
                    >
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </>
              ),
            };
          })}
        />
      </div>
      <div className="overflow-y-auto flex-1">
        {!tabHasItems ? (
          <div className="px-4 py-8 text-center text-sm text-lc-muted">
            {notifTab === 'mentions'
              ? t('shell.desktop.inbox.caughtUpMentions')
              : t('shell.desktop.inbox.caughtUpDms')}
          </div>
        ) : notifTab === 'mentions' ? (
          <ul className="flex flex-col">
            {mentions.map((m) => (
              <InboxRow
                key={m.id}
                read={isMentionRead(m, mentionCursor)}
                label={t(m.reason === 'reply' ? 'shell.desktop.inbox.type.reply' : 'shell.desktop.inbox.type.mention')}
                time={formatTime(m.createdAt)}
                preview={m.preview}
                onClick={() => onMentionClick(m)}
              />
            ))}
          </ul>
        ) : (
          <ul className="flex flex-col">
            {lockedDms > 0 && (
              <InboxRow
                read={false}
                label={t('shell.inbox.locked.count', { count: lockedDms })}
                preview={t('shell.inbox.locked.hint')}
                onClick={onOpenDms}
                testId="notif-dm-locked"
              />
            )}
            {dmNotifications.map((d) => (
              <InboxRow
                key={d.id}
                read={isDmNotificationRead(d, dmCursor)}
                label={t('shell.inbox.type.dm')}
                time={formatTime(d.createdAt)}
                // No preview while DMs are locked: the text is still encrypted.
                preview={d.preview ?? t('common.ping.newDm')}
                onClick={() => onDmClick(d)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}

function InboxRow({ read, label, time, preview, onClick, testId }: {
  read: boolean;
  label: string;
  time?: string;
  preview: string | null | undefined;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        data-testid={testId}
        className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-lc-card/60 transition-colors ${read ? '' : 'bg-lc-olive/30'}`}
      >
        <span className={`mt-1 inline-block w-2 h-2 rounded-full shrink-0 ${read ? 'bg-transparent' : 'bg-lc-green'}`} />
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wider text-lc-muted font-mono mb-0.5">
            {label}
            {time && <span className="ml-2 text-lc-muted/70 normal-case tracking-normal">{time}</span>}
          </div>
          {preview && (
            <div className="text-sm text-lc-white truncate"><MentionText content={preview} /></div>
          )}
        </div>
      </button>
    </li>
  );
}
