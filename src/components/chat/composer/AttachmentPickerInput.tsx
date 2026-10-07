'use client';

import type { RefObject } from 'react';
import FileInput from '@/components/ui/forms/FileInput';
import { useAttachmentPickerInput } from '@/hooks/chat/composer/useAttachmentPickerInput';

/** One hidden picker per menu entry; a pick hands every chosen file over and resets the input. */
export function AttachmentPickerInput({
  inputRef,
  label,
  accept,
  capture,
  onFiles,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  label: string;
  accept?: string;
  capture?: 'environment';
  onFiles: (files: File[]) => void;
}) {
  const vm = useAttachmentPickerInput(onFiles);
  return (
    <FileInput
      ref={inputRef}
      accept={accept}
      capture={capture}
      multiple={!capture}
      aria-label={label}
      onChange={vm.onChange}
    />
  );
}
