'use client';

import PqMessageMark from '@/components/chat/pq/PqMessageMark';
import { useLocale, useTranslations } from 'next-intl';
import { DmMessageBody } from '@/components/chat/dm/message/DmMessageBody';
import { DmMessageMenu } from '@/components/chat/dm/message/DmMessageMenu';
import type { DmThreadItem } from '@/hooks/chat/dm/thread/useDmThread';
import type { PqMessageMark as Mark } from '@/services/chat/pq/status';
import { timeOfDay } from '@/utils/shell/mobile/labels';
import { dmBubbleClass } from '@/utils/shell/mobile/dm-list';

/**
 * One entry of a phone DM thread: a day divider, or a bubble with its menu,
 * body, post-quantum mark, time, and retry / dismiss for a failed send.
 */
export function DmThreadEntry({
  item,
  mark,
  onRetry,
  onDismiss,
}: {
  item: DmThreadItem;
  mark: Mark | null;
  onRetry: (clientTag: string) => void;
  onDismiss: (clientTag: string) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  if (item.type === 'divider') return <div className="day-divider">{item.label}</div>;
  const { msg } = item;
  return (
    <div className={dmBubbleClass(msg)}>
      <DmMessageMenu message={msg} />
      <div className="dm-bubble-text"><DmMessageBody message={msg} /></div>
      <div className="dm-bubble-meta">
        {/* `onAccent` on outgoing: the bubble is `var(--accent)` with
            `var(--accent-ink)` text, the same contrast trap as
            desktop's `bg-lc-green`. */}
        <PqMessageMark mark={mark} onAccent={msg.outgoing} />
        {msg.pending && <span className="dm-bubble-spinner" aria-label={t('common.sending')} role="status" />}
        <span className="dm-bubble-time">{timeOfDay(msg.createdAt, locale)}</span>
      </div>
      {msg.failed && msg.clientTag && (
        <div className="dm-bubble-failed" data-testid="mobile-dm-failed">
          <span className="dm-bubble-failed-label">{t('dm.failedSend')}</span>
          <button
            type="button"
            className="dm-bubble-retry"
            onClick={() => onRetry(msg.clientTag!)}
            data-testid="mobile-dm-retry"
          >
            {t('common.retry')}
          </button>
          <button
            type="button"
            className="dm-bubble-dismiss"
            onClick={() => onDismiss(msg.clientTag!)}
            aria-label={t('dm.dismissFailed')}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
