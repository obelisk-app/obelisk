'use client';

import type { JsMessage, JsReaction, MessagesStatus } from '@/services/nostr-bridge';
import { useTranslation } from '@/i18n/context';
import { ChannelMessage, EMPTY_REACTIONS } from '../ChannelMessage';
import type { TimelineItem } from './channel-timeline';

type Props = {
  items: ReadonlyArray<TimelineItem>;
  messagesStatus: MessagesStatus;
  /** Reply parents resolved once per batch, so a row's `parent` prop is stable. */
  messagesById: ReadonlyMap<string, JsMessage>;
  reactions: Readonly<Record<string, ReadonlyArray<JsReaction>>>;
  myPubkey: string | null;
  isAdmin: boolean;
  groupId: string;
  /** Both must be stable callbacks: every memoized row receives them. */
  onLongPress: (m: JsMessage) => void;
  onAvatar: (pubkey: string) => void;
};

/** The phone channel's messages with day dividers, or the loading / empty state. */
export function ChannelTimeline({
  items, messagesStatus, messagesById, reactions, myPubkey, isAdmin, groupId, onLongPress, onAvatar,
}: Props) {
  const { t } = useTranslation();
  if (items.length === 0) {
    // Bridge-owned confidence: only render "No messages yet" once
    // the retry ladder has exhausted (status === 'empty-confirmed').
    // 'loading' and 'empty-unconfirmed' both keep the spinner up.
    return messagesStatus !== 'empty-confirmed' ? (
      <div className="empty-state" data-testid="messages-loading">
        <div className="lc-spinner" aria-hidden="true" />
        <div className="empty-state-title">{t('mobile.channel.loadingMessages')}</div>
      </div>
    ) : (
      <div className="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        <div className="empty-state-title">{t('mobile.channel.noMessages')}</div>
        <div className="empty-state-desc">{t('mobile.channel.noMessagesDescription')}</div>
      </div>
    );
  }
  return (
    <>
      {items.map((it) =>
        it.type === 'divider' ? (
          <div key={it.key} className="day-divider">{it.label}</div>
        ) : (
          <ChannelMessage
            key={it.key}
            msg={it.msg}
            parent={it.msg.replyToId ? messagesById.get(it.msg.replyToId) ?? null : null}
            myPubkey={myPubkey}
            isAdmin={isAdmin}
            groupId={groupId}
            reactions={reactions[it.msg.id] ?? EMPTY_REACTIONS}
            onLongPress={onLongPress}
            onAvatar={onAvatar}
          />
        ),
      )}
    </>
  );
}
