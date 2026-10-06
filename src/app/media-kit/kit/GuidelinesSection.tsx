'use client';

import { useTranslation } from '@/i18n/context';
import { Section } from './kit-ui';

/** Do and don't for the brand. */
export function GuidelinesSection() {
  const { t } = useTranslation();
  return (
    <Section
      id="guidelines"
      title={t('mediaKit.guidelines')}
      description="Simple rules to keep the brand consistent."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="lc-card p-5">
          <div className="text-lc-green font-semibold mb-2">✓ Do</div>
          <ul className="space-y-1 text-sm text-lc-white list-disc list-inside">
            <li>
              {t('mediaKit.rule.dark')}
            </li>
            <li>
              Respect the clear-space area: at least the symbol&apos;s
              height around it.
            </li>
            <li>
              {t('mediaKit.rule.green')}
            </li>
            <li>
              {t('mediaKit.rule.capital')}
            </li>
          </ul>
        </div>
        <div className="lc-card p-5">
          <div className="text-red-400 font-semibold mb-2">✕ Don&apos;t</div>
          <ul className="space-y-1 text-sm text-lc-white list-disc list-inside">
            <li>{t('mediaKit.rule.noSkew')}</li>
            <li>
              {t('mediaKit.rule.noColors')}
            </li>
            <li>
              Don&apos;t place the logo on low-contrast backgrounds
              (mid-grays).
            </li>
            <li>
              {t('mediaKit.rule.noEffects')}
            </li>
          </ul>
        </div>
      </div>
    </Section>
  );
}
