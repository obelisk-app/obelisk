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
 * It also keeps the guides-URL rewrite the toggle did: English articles are
 * unprefixed and the rest live under `/guides/<locale>`, so switching
 * language on a guide has to move you to the same article in the new one.
 */

import { useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from '@/i18n/context';
import { LOCALES, type Locale } from '@/i18n';
import { guidesHref } from '@/utils/guides/guide-urls';
import Button from '@/components/ui/Button';
import { CheckIcon, ChevronDownIcon } from '@/components/ui/icons';
import { MenuItem } from '@/components/ui/menu';
import PopoverPanel from '@/components/ui/PopoverPanel';

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
  const { locale, setLocale } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const pick = (next: Locale) => {
    setOpen(false);
    if (next === locale) return;
    setLocale(next);

    // On a URL-localised guides route, rewrite the URL so the article
    // matches the language that was just chosen. English has no prefix;
    // everything else is `/guides/<locale>`.
    if (!pathname) return;
    const prefixed = pathname.match(new RegExp(`^/guides/(?:${LOCALES.join('|')})(?:/(.*))?$`));
    if (prefixed) {
      router.push(guidesHref(next, prefixed[1] || undefined));
      return;
    }
    const english = pathname.match(/^\/guides(?:\/([^/]+))?$/);
    if (english) router.push(guidesHref(next, english[1] || undefined));
  };

  return (
    <>
      <Button
        ref={triggerRef}
        variant="outlinePill"
        size="xs"
        onClick={() => setOpen((value) => !value)}
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
        onClose={() => setOpen(false)}
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
