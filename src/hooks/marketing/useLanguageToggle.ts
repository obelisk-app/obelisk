'use client';

import { useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import type { Locale } from '@/i18n';
import { useSwitchLocale } from '@/hooks/i18n/useSwitchLocale';

/**
 * The public site's language picker: which language the page is in, whether
 * the menu is open, and picking one, which closes the menu and goes to the
 * same page in that language (`useSwitchLocale`; picking the current one
 * only closes it).
 */
export function useLanguageToggle() {
  const locale = useLocale();
  const switchLocale = useSwitchLocale();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return {
    locale,
    triggerRef,
    open,
    toggle: () => setOpen((value) => !value),
    close: () => setOpen(false),
    pick: (next: Locale) => {
      setOpen(false);
      switchLocale(next);
    },
  };
}
