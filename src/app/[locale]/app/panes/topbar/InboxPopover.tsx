'use client';

import Text from '@/components/ui/layout/Text';
import List from '@/components/ui/layout/List';
import Row from '@/components/ui/layout/Row';
import Button from '@/components/ui/buttons/Button';
import { createPortal } from 'react-dom';
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
import { InboxRow } from './InboxRow';
import { InboxTabLabel } from './InboxTabLabel';

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
        <Text size="sm" tone="default" weight="semibold">{t('common.notifications')}</Text>
        {/* Pill affordances, per the La Crypta 9999px-radius convention.
            "Mark read" is an outlined accent pill so it stays secondary
            to the solid green unread badges in the tab strip below;
            "Clear" is neutral because it is destructive-ish and should
            not invite a reflexive click. */}
        <Row gap="1.5" align="center">
          {tabHasItems && tabUnread > 0 && (
            <Button
              variant="bare"
              onClick={inbox.handleMarkRead}
              data-testid="notif-mark-read"
              className="rounded-full border border-lc-green/40 bg-lc-green/10 px-2.5 py-1 text-[11px] font-semibold leading-none text-lc-green transition-colors hover:border-lc-green/70 hover:bg-lc-green/20"
              title={notifTab === 'mentions'
                ? t('shell.desktop.inbox.markReadMentionsTitle')
                : t('shell.desktop.inbox.markReadDmsTitle')}
            >
              {t('shell.desktop.inbox.markRead')}
            </Button>
          )}
          {tabHasItems && (
            <Button
              variant="bare"
              onClick={inbox.handleClear}
              data-testid="notif-clear"
              className="rounded-full border border-lc-border bg-lc-card px-2.5 py-1 text-[11px] font-medium leading-none text-lc-muted transition-colors hover:border-lc-muted/50 hover:text-lc-white"
              title={t('common.clear')}
            >
              {t('common.clear')}
            </Button>
          )}
        </Row>
      </div>
      <div className="px-2 py-2 border-b border-lc-border" data-testid="notif-tabs" data-tour="inbox-tabs">
        <SegmentedControl
          fit="fill"
          aria-label={t('common.notifications')}
          value={notifTab}
          onChange={setNotifTab}
          options={inbox.tabs.map((tab) => ({
            value: tab.key,
            testId: tab.testId,
            label: <InboxTabLabel tab={tab} selected={notifTab === tab.key} />,
          }))}
        />
      </div>
      <div className="overflow-y-auto flex-1">
        {!tabHasItems ? (
          <Text as="div" size="sm" tone="muted" className="px-4 py-8 text-center">
            {notifTab === 'mentions'
              ? t('shell.desktop.inbox.caughtUpMentions')
              : t('shell.desktop.inbox.caughtUpDms')}
          </Text>
        ) : notifTab === 'mentions' ? (
          <List marker="none" spacing="none" className="flex flex-col">
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
          </List>
        ) : (
          <List marker="none" spacing="none" className="flex flex-col">
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
          </List>
        )}
      </div>
    </div>,
    document.body,
  );
}
