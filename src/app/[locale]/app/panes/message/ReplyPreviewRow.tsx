'use client';

import { displayNameFor } from '@/utils/identity/display-name';
import { useUserMetadata as useProfile, type JsMessage } from '@/services/nostr-bridge';
import { MentionText } from '@/components/chat/mentions/MentionText';
import { useTranslations } from 'next-intl';

/** The quoted parent above a reply; clicking it jumps to the parent. */
export function ReplyPreviewRow({
  parent,
  onJump,
}: {
  parent: JsMessage;
  onJump: () => void;
}) {
  const t = useTranslations();
  const meta = useProfile(parent.pubkey);
  const name = displayNameFor(parent.pubkey, meta);
  const preview = parent.content.replace(/\s+/g, ' ').slice(0, 120);
  return (
    <button
      type="button"
      onClick={onJump}
      className="mb-1 flex max-w-full items-center gap-2 truncate text-xs text-lc-muted hover:text-lc-white"
      title={t('shell.desktop.message.jumpToReply')}
    >
      <span className="text-lc-green">↩</span>
      <span className="font-semibold text-lc-white/80">{name}</span>
      <span className="truncate text-lc-muted"><MentionText content={preview} /></span>
    </button>
  );
}
