'use client';
import { useConcordMessageBody } from '@/hooks/chat/concord/useConcordMessageBody';
import { useTranslations } from 'next-intl';
import RemoteImage from '@/components/ui/media/RemoteImage';
import ConcordAttachment from './ConcordAttachment';

/** Only authenticated, locally decrypted media is displayed. */
export default function ConcordMessageBody({ id, content }: { id: string; content: string }) {
  const t = useTranslations();
  const vm = useConcordMessageBody(id, content);
  return <div data-testid="message-content" className="whitespace-pre-wrap break-words">
    {vm.text}
    {vm.pending?.files.map((file, index) => <div key={index}>
      {file.type.startsWith('image/') ? <RemoteImage src={vm.pending!.previews[index]} alt={file.name} className="max-h-80 max-w-full rounded-lg" data-testid="concord-local-preview" /> : <span>{file.name}</span>}
    </div>)}
    {vm.pending && <div role="status" data-testid="concord-send-status" className="text-sm text-lc-text-muted">{t(`chat.concord.sendStatus.${vm.pending.phase}`)}</div>}
    {vm.attachments.map(attachment => <ConcordAttachment key={attachment.url} attachment={attachment} />)}
  </div>;
}
