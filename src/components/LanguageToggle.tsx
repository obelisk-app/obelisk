'use client';

/**
 * The public site's language control.
 *
 * It used to be a two-state toggle: it computed `locale === 'es' ? 'en' :
 * 'es'` and rendered the code of the *other* language. With a third
 * language there is no "other", so it is a picker — and each language is
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
import { guidesHref } from '@/lib/guide-urls';
import AnchoredMenu from '@/components/social/AnchoredMenu';

/** Endonyms — each language named as its own speakers name it. */
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
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 rounded-full border border-lc-border px-2.5 py-1 text-xs font-medium text-lc-muted transition-colors hover:border-lc-green/30 hover:text-lc-white"
        aria-label={LANGUAGE_NAMES[locale]}
        aria-expanded={open}
        data-testid="language-toggle"
      >
        {LANGUAGE_CODES[locale]}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        width={160}
        testId="language-menu"
      >
        {LOCALES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => pick(option)}
            aria-current={option === locale}
            className={`block w-full px-4 py-2 text-left text-xs transition-colors hover:bg-white/5 ${
              option === locale ? 'text-lc-green' : 'text-lc-white'
            }`}
            data-testid={`language-menu-${option}`}
          >
            {LANGUAGE_NAMES[option]}
          </button>
        ))}
      </AnchoredMenu>
    </>
  );
}
