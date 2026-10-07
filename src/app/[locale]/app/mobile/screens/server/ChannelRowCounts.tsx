'use client';

import { useTranslations } from 'next-intl';
import { rowCount } from '@/utils/shell/mobile/channel-row';

/** A channel row's trailing marks: muted, unread count, mentions-or-replies pill. */
export function ChannelRowCounts({ muted, unread, mentionsOrReplies }: { muted: boolean; unread: number; mentionsOrReplies: number }) {
  const t = useTranslations();
  return (
    <>
      {muted && <span aria-label={t('mobile.channel.muted')} title={t('mobile.channel.muted')} style={{ fontSize: 11 }}>🔕</span>}
      {unread > 0 && <span className="ch-meta">{rowCount(unread)}</span>}
      {mentionsOrReplies > 0 && (
        <span className="mention-pill" aria-label={t('mobile.channel.mentionsOrReplies', { count: mentionsOrReplies })}>
          {rowCount(mentionsOrReplies)}
        </span>
      )}
    </>
  );
}
