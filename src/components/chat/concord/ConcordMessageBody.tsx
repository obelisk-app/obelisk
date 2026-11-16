'use client';
import { useConcordMessageBody } from '@/hooks/chat/concord/useConcordMessageBody';
import ConcordAttachment from './ConcordAttachment';

/** Only authenticated, locally decrypted media is displayed. */
export default function ConcordMessageBody({ id, content }: { id: string; content: string }) {
  const vm = useConcordMessageBody(id, content);
  return <div data-testid="message-content" className="whitespace-pre-wrap break-words">
    {vm.text}
    {vm.attachments.map(attachment => <ConcordAttachment key={attachment.url} attachment={attachment} />)}
  </div>;
}
