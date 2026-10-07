'use client';

import { useBlossomUpload } from '@/hooks/media/upload/useBlossomUpload';
import { takePickedFile } from '@/utils/media/upload/picked-file';

export type AppearanceSlot = 'picture' | 'banner';

/** A channel's picture and banner uploads, one at a time, each landing in its own field. */
export function useChannelAppearanceInput(onPictureChange: (url: string) => void, onBannerChange: (url: string) => void) {
  const { uploading, error, upload } = useBlossomUpload<AppearanceSlot>();
  const picked = (input: HTMLInputElement, slot: AppearanceSlot) => {
    const file = takePickedFile(input);
    if (file) void upload(file, slot, slot === 'picture' ? onPictureChange : onBannerChange);
  };
  return { uploading, error, picked };
}
