'use client';

import PqMessageMark from '@/components/chat/pq/PqMessageMark';
import { DmMessageBody } from '@/components/chat/dm/message/DmMessageBody';
import { DM_BUBBLE_MENU_GUTTER, DmMessageMenu } from '@/components/chat/dm/message/DmMessageMenu';
import type { JsDirectMessage } from '@/services/nostr-bridge';
import type { DmThread } from '@/hooks/chat/dm/thread/useDmThread';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/hooks/common/useFormat';
import Button from '@/components/ui/buttons/Button';
import CloseButton from '@/components/ui/buttons/CloseButton';

/**
 * One message in the desktop DM thread: green and right-aligned when it is
 * yours, faded with a spinner while sending, ringed red with retry and
 * dismiss when the send failed.
 */
export function DmBubble({ msg, mark, onRetry, onDismiss }: {
  msg: JsDirectMessage;
  mark: DmThread['marks'][number] | null;
  onRetry: (clientTag: string) => void;
  onDismiss: (clientTag: string) => void;
}) {
  const t = useTranslations();
  const { formatTime } = useFormat();
  return (
    <div
      className={
        `relative mb-2 max-w-md rounded-2xl py-2 pl-4 ${DM_BUBBLE_MENU_GUTTER} text-sm shadow-sm ` +
        (msg.outgoing
          ? 'ml-auto bg-lc-green text-lc-black'
          : 'bg-lc-card text-lc-white') +
        (msg.pending ? ' opacity-60' : '') +
        (msg.failed ? ' ring-1 ring-red-500/60' : '')
      }
    >
      <DmMessageMenu message={msg} />
      <DmMessageBody message={msg} />
      <div className={'mt-1 flex items-center justify-end gap-1.5 text-[10px] ' + (msg.outgoing ? 'text-black/60' : 'text-lc-muted')}>
        {/* `onAccent` because the outgoing bubble is `bg-lc-green`:
            the default `text-lc-muted` is ~2:1 against it. This row
            already switches the timestamp the same way. */}
        <PqMessageMark mark={mark} onAccent={msg.outgoing} />
        {msg.pending && (
          <span
            className={'inline-block h-2.5 w-2.5 animate-spin rounded-full border ' + (msg.outgoing ? 'border-black/30 border-t-black/70' : 'border-lc-muted/40 border-t-lc-muted')}
            aria-label={t('common.sending')}
            role="status"
          />
        )}
        <span>{formatTime(msg.createdAt)}</span>
      </div>
      {msg.failed && msg.clientTag && (
        <div className="mt-1.5 flex items-center justify-end gap-2 text-[11px] text-red-500" data-testid="dm-failed">
          <span>{t('dm.failedSend')}</span>
          <Button
            variant="outline"
            tone="danger"
            size="xs"
            onClick={() => onRetry(msg.clientTag!)}
            data-testid="dm-retry"
          >
            {t('common.retry')}
          </Button>
          <CloseButton
            size="sm"
            onClick={() => onDismiss(msg.clientTag!)}
            label={t('dm.dismissFailed')}
            className="-my-1 text-red-500/70 hover:bg-red-500/10 hover:text-red-500"
          />
        </div>
      )}
    </div>
  );
}
