'use client';

import { useTranslation } from '@/i18n/context';

export default function LanguageToggle() {
  const { locale, setLocale } = useTranslation();

  return (
    <button
      onClick={() => setLocale(locale === 'es' ? 'en' : 'es')}
      className="px-2.5 py-1 rounded-full text-xs font-medium border border-lc-border hover:border-lc-green/30 text-lc-muted hover:text-lc-white transition-colors"
      aria-label={`Switch to ${locale === 'es' ? 'English' : 'Español'}`}
    >
      {locale === 'es' ? 'EN' : 'ES'}
    </button>
  );
}
