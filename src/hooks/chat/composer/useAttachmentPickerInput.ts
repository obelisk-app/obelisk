'use client';

import type { ChangeEvent } from 'react';

/** A hidden file picker's change handler: hand every chosen file over, then reset the input so the same file can be picked again. */
export function useAttachmentPickerInput(onFiles: (files: File[]) => void) {
  return {
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length) onFiles(files);
      event.target.value = '';
    },
  };
}
