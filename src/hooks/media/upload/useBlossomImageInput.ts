'use client';

import { useBlossomUpload } from '@/hooks/media/upload/useBlossomUpload';
import { takePickedFile } from '@/utils/media/upload/picked-file';

/** One image URL field with an upload button: a picked file goes to Blossom and its URL into the field. */
export function useBlossomImageInput(onChange: (url: string) => void) {
  const { uploading, error, upload } = useBlossomUpload<'file'>();
  const picked = (input: HTMLInputElement) => {
    const file = takePickedFile(input);
    if (file) void upload(file, 'file', onChange);
  };
  return { uploading: uploading !== null, error, picked };
}
