'use client';

/**
 * The public site's language control.
 *
 * It used to be a two-state toggle: it computed `locale === 'es' ? 'en' :
 * 'es'` and rendered the code of the *other* language. With a third
 * language there is no "other", so it is a picker, and each language is
 * written in its own name, because someone looking for Português cannot be
 * expected to recognise "Portuguese" in a language they don't read.
 *
 * Picking a language navigates to the same page in that language
 * (`/guides/vesta` to `/es/guides/vesta`); see `useSwitchLocale`.
 */

import { LOCALES, type Locale } from '@/i18n';
import { useLanguageToggle } from '@/hooks/marketing/useLanguageToggle';
import Button from '@/components/ui/buttons/Button';
import { CheckIcon, ChevronDownIcon } from '@/components/ui/icons/icons';
import { MenuItem } from '@/components/ui/overlays/menu';
import PopoverPanel from '@/components/ui/overlays/PopoverPanel';

/** Endonyms: each language named as its own speakers name it. */
const LANGUAGE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  pt: 'Português',
};

/** What the closed control shows: short enough for a crowded navbar. */
const LANGUAGE_CODES: Record<Locale, string> = {
  en: 'EN',
  es: 'ES',
  pt: 'PT',
};

export default function LanguageToggle() {
  const { locale, triggerRef, open, toggle, close, pick } = useLanguageToggle();
  return (
    <>
      <Button
        ref={triggerRef}
        variant="outlinePill"
        size="xs"
        onClick={toggle}
        aria-label={LANGUAGE_NAMES[locale]}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="language-toggle"
      >
        {LANGUAGE_CODES[locale]}
        <ChevronDownIcon size={10} strokeWidth={3} />
      </Button>

      <PopoverPanel
        open={open}
        onClose={close}
        anchorRef={triggerRef}
        follow="close"
        width={160}
        surface="menu"
        role="menu"
        testId="language-menu"
      >
        {LOCALES.map((option) => (
          <MenuItem
            key={option}
            role="menuitemradio"
            label={LANGUAGE_NAMES[option]}
            trailing={option === locale ? <CheckIcon size={14} /> : undefined}
            onClick={() => pick(option)}
            buttonProps={{ 'aria-checked': option === locale, 'aria-current': option === locale }}
            testId={`language-menu-${option}`}
          />
        ))}
      </PopoverPanel>
    </>
  );
}
