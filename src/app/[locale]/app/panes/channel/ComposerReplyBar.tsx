'use client';

import Text from '@/components/ui/layout/Text';
import type { JsMessage } from '@/services/nostr-bridge';
import { useTranslations } from 'next-intl';
import { MentionText } from '@/components/chat/mentions/MentionText';
import CloseButton from '@/components/ui/buttons/CloseButton';
import { ReplyAuthorName } from './ReplyAuthorName';

/** Above the composer while replying: who to, the start of their message, and cancel. */
export function ComposerReplyBar({ replyingTo, onCancel }: { replyingTo: JsMessage; onCancel: () => void }) {
  const t = useTranslations();
  return (
    <Text as="div" variant="caption" className="mb-2 flex items-center justify-between gap-2 rounded-t-md border border-b-0 border-lc-border bg-lc-card/60 px-3 py-1.5">
      <span className="truncate">
        {t('shell.desktop.composer.replyingTo')} <ReplyAuthorName pubkey={replyingTo.pubkey} />
        <span className="ml-2 truncate text-lc-muted"><MentionText content={replyingTo.content.slice(0, 80)} /></span>
      </span>
      <CloseButton size="sm" className="-my-1" onClick={onCancel} label={t('shell.desktop.composer.cancelReply')} />
    </Text>
  );
}
