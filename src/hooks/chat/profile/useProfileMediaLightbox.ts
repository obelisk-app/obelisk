import type { MouseEvent } from 'react';
import { useDismiss } from '@/hooks/common/useDismiss';
import { isVideoUrl } from '@/utils/attachments/attachments';

export function useProfileMediaLightbox(url: string, onClose: () => void) {
  useDismiss({ onDismiss: onClose, outside: 'none' });
  return {
    video: isVideoUrl(url),
    backdropClick: (event: MouseEvent) => { event.stopPropagation(); onClose(); },
    stopClick: (event: MouseEvent) => event.stopPropagation(),
  };
}
