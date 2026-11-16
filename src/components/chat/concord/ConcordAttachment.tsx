'use client';
import type { MediaAttachment } from '@applesauce/concord/helpers';
import { useTranslations } from 'next-intl';
import { useConcordAttachment } from '@/hooks/chat/concord/useConcordAttachment';
import Button from '@/components/ui/buttons/Button';
import RemoteImage from '@/components/ui/media/RemoteImage';
import Skeleton from '@/components/ui/animations/Skeleton';

export default function ConcordAttachment({ attachment }: { attachment: MediaAttachment }) {
  const t = useTranslations();
  const vm = useConcordAttachment(attachment);
  if (vm.error) return <div role="alert" className="text-sm text-red-500">{t('dm.file.failed')}</div>;
  if (vm.category === 'file') return <Button variant="outline" size="sm" onClick={vm.download}>{t('chat.concord.downloadAttachment')}</Button>;
  if (!vm.url) return <Skeleton className="h-32 w-64 max-w-full rounded-lg" aria-label={t('dm.file.decrypting')} />;
  if (vm.category === 'image') return <RemoteImage src={vm.url} alt={t('dm.file.attachment')} className="max-h-80 max-w-full rounded-lg" data-testid="concord-image" />;
  if (vm.category === 'video') return <video src={vm.url} controls preload="metadata" className="max-h-80 max-w-full rounded-lg" data-testid="concord-video" />;
  return <audio src={vm.url} controls preload="metadata" className="max-w-full" data-testid="concord-audio" />;
}
