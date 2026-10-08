'use client';

import Button from '@/components/ui/buttons/Button';
import { displayNameFor } from '@/utils/identity/display-name';
import { useUserMetadata, type JsMessage } from '@/services/nostr-bridge';
import { MentionText } from '@/components/chat/mentions/MentionText';
import { replyPreviewText } from '@/utils/shell/mobile/labels';

/** The quote above a reply: who wrote the parent and the start of it; a tap jumps to it. */
export function MobileReplyPreviewRow({
  parent,
  onJump,
}: {
  parent: JsMessage;
  onJump: (e: React.MouseEvent) => void;
}) {
  const meta = useUserMetadata(parent.pubkey);
  return (
    <Button variant="bare" type="button" className="msg-reply-row" onClick={onJump}>
      <span className="msg-reply-arrow">↩</span>
      <span className="msg-reply-name">{displayNameFor(parent.pubkey, meta)}</span>
      <span className="msg-reply-text"><MentionText content={replyPreviewText(parent.content)} /></span>
    </Button>
  );
}
