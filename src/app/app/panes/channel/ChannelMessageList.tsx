'use client';

import type { JsGroup, JsMessage, JsReaction } from '@/services/nostr-bridge';
import type { MessageZapTotal } from '@/hooks/chat/useMessageZaps';
import { useTranslation } from '@/i18n/context';
import { MessageRow } from '../MessageRow';
import { isGroupedWith, type ChannelEmptyStage } from '@/utils/chat/channel-list-state';

/** Stable empty list so a message without reactions keeps the same prop identity. */
const EMPTY_REACTIONS: never[] = [];

type Props = {
  groupId: string;
  group: JsGroup | null | undefined;
  messages: ReadonlyArray<JsMessage>;
  /** Reply parents resolved once per batch, so a row's `parent` prop is stable. */
  messagesById: ReadonlyMap<string, JsMessage>;
  reactions: Readonly<Record<string, ReadonlyArray<JsReaction>>>;
  zapTotals: ReadonlyMap<string, MessageZapTotal>;
  isAdmin: boolean;
  /** Must be stable (a state setter): every memoized row receives it. */
  onReply: (m: JsMessage) => void;
  emptyStage: ChannelEmptyStage;
};

/**
 * The messages, or the empty state that explains their absence.
 *
 * Every prop handed to `MessageRow` is identity-stable across a keystroke in
 * the composer, so typing does not re-render the visible rows.
 */
export function ChannelMessageList({
  groupId, group, messages, messagesById, reactions, zapTotals, isAdmin, onReply, emptyStage,
}: Props) {
  if (messages.length === 0) return <ChannelEmpty groupId={groupId} group={group} stage={emptyStage} />;
  return (
    <>
      {messages.map((m, i) => (
        <MessageRow
          key={m.id}
          msg={m}
          parent={m.replyToId ? messagesById.get(m.replyToId) ?? null : null}
          reactions={reactions[m.id] ?? EMPTY_REACTIONS}
          zapTotal={zapTotals.get(m.id) ?? null}
          groupId={groupId}
          grouped={isGroupedWith(messages[i - 1], m)}
          isAdmin={isAdmin}
          onReply={onReply}
        />
      ))}
    </>
  );
}

function ChannelEmpty({ groupId, group, stage }: {
  groupId: string;
  group: JsGroup | null | undefined;
  stage: ChannelEmptyStage;
}) {
  const { t } = useTranslation();
  if (stage === 'loading-info' || stage === 'loading-messages') {
    return (
      <div
        className="flex h-full items-center justify-center text-sm text-lc-muted"
        data-testid="messages-loading"
        data-stage={stage === 'loading-info' ? 'channel-info' : 'messages'}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="lc-spinner" aria-hidden="true" />
          <div>{stage === 'loading-info' ? t('desktop.channel.loadingInfo') : t('desktop.channel.loadingMessages')}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center text-sm text-lc-muted">
      <div className="max-w-md text-center">
        {group ? (
          <>
            <div className="text-base font-medium text-lc-white">
              {t('desktop.channel.welcome').replace('{name}', group.name ?? t('common.channel'))}
            </div>
            <div className="mt-1">{t('desktop.channel.noMessages')}</div>
          </>
        ) : (
          <>
            <div className="text-base font-medium text-lc-white">
              {t('desktop.channel.notVisible')}
            </div>
            <div className="mt-1">
              {t('desktop.channel.notVisibleDescription').replace('{id}', `${groupId.slice(0, 16)}...`)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
