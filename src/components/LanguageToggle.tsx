'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from '@/i18n/context';

export default function LanguageToggle() {
  const { locale, setLocale } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();

  const handleClick = () => {
    const next = locale === 'es' ? 'en' : 'es';
    setLocale(next);

    // When we are on a URL-localized route like /guides/<locale>/..., also
    // rewrite the URL so the rendered content matches the new language. On
    // non-localized routes (landing page, /chat, etc.) the cookie flip alone
    // is enough — the React tree re-renders via context.
    const match = pathname?.match(/^\/guides\/(en|es)(\/.*)?$/);
    if (match) {
      const rest = match[2] || '';
      router.push(`/guides/${next}${rest}`);
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
