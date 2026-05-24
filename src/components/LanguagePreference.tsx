'use client';

import { useTranslation } from '@/i18n/context';
import type { Locale } from '@/i18n/index';

const OPTIONS: Array<{ locale: Locale; label: string }> = [
  { locale: 'es', label: 'Español' },
  { locale: 'en', label: 'English' },
];

interface Props {
  variant?: 'desktop' | 'mobile';
}

export default function LanguagePreference({ variant = 'desktop' }: Props) {
  const { locale, setLocale, t } = useTranslation();

  const controls = (
    <div className="flex shrink-0 overflow-hidden rounded-full border border-lc-border bg-lc-black/60 p-0.5" data-testid="language-preference-control">
      {OPTIONS.map((option) => {
        const active = option.locale === locale;
        return (
          <button
            key={option.locale}
            type="button"
            onClick={() => setLocale(option.locale)}
            aria-pressed={active}
            data-testid={`language-option-${option.locale}`}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              active ? 'bg-lc-green text-lc-black' : 'text-lc-muted hover:text-lc-white'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );

  if (variant === 'mobile') {
    return (
      <div className="settings-row language-row" data-testid="language-preference">
        <span>{t('preferences.language.label')}</span>
        <span className="settings-row-meta">{controls}</span>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-lc-border bg-lc-black/30 p-3" data-testid="language-preference">
      <div className="min-w-0">
        <div className="text-sm text-lc-white">{t('preferences.language.label')}</div>
        <div className="mt-0.5 text-xs text-lc-muted">{t('preferences.language.description')}</div>
      </div>
      {controls}
    </div>
  );
}
