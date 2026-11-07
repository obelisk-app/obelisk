import { useTranslations } from 'next-intl';
import { messagePreviewSegments } from '@/utils/message-text/preview';

export function useMentionPreview(content: string, max: number) {
  const t = useTranslations();
  return messagePreviewSegments(content, {
    image: t('common.preview.image'), video: t('common.preview.video'),
    audio: t('common.preview.audio'), file: t('common.preview.file'),
  }, max);
}
