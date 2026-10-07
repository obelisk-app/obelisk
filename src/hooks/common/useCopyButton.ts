'use client';

import { useCopyToClipboard } from '@/hooks/common/useCopyToClipboard';

/**
 * The CopyButton's view model: copy `text`, run `onCopied` only when the
 * browser took it, and say whether the tick is showing.
 */
export function useCopyButton(text: string, onCopied?: () => void) {
  const { copied, copy } = useCopyToClipboard();
  const onCopy = async () => {
    if (await copy(text)) onCopied?.();
  };
  return {
    done: copied !== null,
    copy: () => void onCopy(),
  };
}
