'use client';

import type { ChangeEvent } from 'react';
import type { JsMediaKind } from '@/services/nostr-bridge';
import { takePickedFile } from '@/utils/media/upload/picked-file';

/** The "+ Create" tile's file input: hand the picked file over with its kind, then reset so the same file can be picked again. */
export function useCreateMediaControl(kind: JsMediaKind, onFile: (file: File | undefined, kind: JsMediaKind) => void) {
  return {
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      onFile(takePickedFile(event.target), kind);
    },
  };
}
