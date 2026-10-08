'use client';

import Card from '@/components/ui/layout/Card';
import { useTranslations } from 'next-intl';
import Section from '@/components/ui/layout/Section';

/** Do and don't for the brand. */
export function GuidelinesSection() {
  const t = useTranslations();
  return (
    <Section
      id="guidelines"
      title={t('mediaKit.guidelines')}
      description={t('mediaKit.desc.guidelines')}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Card variant="interactive" padding="xl">
          <div className="text-lc-green font-semibold mb-2">{t('mediaKit.do')}</div>
          <ul className="space-y-1 text-sm text-lc-white list-disc list-inside">
            <li>
              {t('mediaKit.rule.dark')}
            </li>
            <li>{t('mediaKit.rule.clearSpace')}</li>
            <li>
              {t('mediaKit.rule.green')}
            </li>
            <li>
              {t('mediaKit.rule.capital')}
            </li>
          </ul>
        </Card>
        <Card variant="interactive" padding="xl">
          <div className="text-red-400 font-semibold mb-2">{t('mediaKit.dont')}</div>
          <ul className="space-y-1 text-sm text-lc-white list-disc list-inside">
            <li>{t('mediaKit.rule.noSkew')}</li>
            <li>
              {t('mediaKit.rule.noColors')}
            </li>
            <li>{t('mediaKit.rule.lowContrast')}</li>
            <li>
              {t('mediaKit.rule.noEffects')}
            </li>
          </ul>
        </Card>
      </div>
    </Section>
  );
}
