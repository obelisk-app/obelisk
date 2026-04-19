'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from '@/i18n/context';
import { guidesHref } from '@/lib/guide-urls';

export default function LanguageToggle() {
  const { locale, setLocale } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();

  const handleClick = () => {
    const next = locale === 'es' ? 'en' : 'es';
    setLocale(next);

    // When on a URL-localized guides route, rewrite the URL so the rendered
    // content matches the new language. English is the default and has no
    // locale prefix (/guides, /guides/<slug>); Spanish lives under /guides/es.
    if (!pathname) return;
    const esMatch = pathname.match(/^\/guides\/es(?:\/(.*))?$/);
    if (esMatch) {
      const slug = esMatch[1];
      router.push(guidesHref(next, slug || undefined));
      return;
    }
    const enMatch = pathname.match(/^\/guides(?:\/([^/]+))?$/);
    if (enMatch) {
      const slug = enMatch[1];
      router.push(guidesHref(next, slug || undefined));
    }
  };

  return (
    <button
      onClick={handleClick}
      className="px-2.5 py-1 rounded-full text-xs font-medium border border-lc-border hover:border-lc-green/30 text-lc-muted hover:text-lc-white transition-colors"
      aria-label={`Switch to ${locale === 'es' ? 'English' : 'Español'}`}
    >
      {locale === 'es' ? 'EN' : 'ES'}
    </button>
  );
}
