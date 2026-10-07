'use client';

import { useLocale } from 'next-intl';
import { useHintsStore } from '@/store/hints';

/** The help panel's view model: the locale its links are built for, and replaying the in-app tips. */
export function useHelpPopover(onClose: () => void) {
  const locale = useLocale();
  const resetHints = useHintsStore((state) => state.resetHints);
  return {
    locale,
    /** Show every one-shot hint again, then close the panel. */
    replayHints: () => { resetHints(); onClose(); },
  };
}
