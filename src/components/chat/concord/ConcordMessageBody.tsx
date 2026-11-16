'use client';
import { useTranslations } from 'next-intl';
import { useChannelProtocol } from '@/hooks/chat/channel/useChannelProtocol';
import Button from '@/components/ui/buttons/Button';

/** Private text never enters remote unfurl, media-preview or public game loaders. */
export default function ConcordMessageBody({ id, content }: { id: string; content: string }) {
  const t = useTranslations();
  const protocol = useChannelProtocol();
  return <div data-testid="message-content" className="whitespace-pre-wrap break-words">
    {content}
    {protocol?.attachments(id).map((attachment, index) => <Button key={index} variant="outline" size="sm" onClick={() => void protocol.download(attachment)}>{t('chat.concord.downloadAttachment')}</Button>)}
  </div>;
}
