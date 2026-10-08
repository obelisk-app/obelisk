'use client';

import Card from '@/components/ui/layout/Card';
import { useTranslations } from 'next-intl';
import { useShortCopy } from '@/hooks/media-kit/kit/useShortCopy';
import { CopyButton } from './CopyButton';
import Section from '@/components/ui/layout/Section';

/** Quick-use phrases. */
export function ShortCopySection() {
  const t = useTranslations();
  const items = useShortCopy();
  return (
    <Section
      id="copy"
      title={t('mediaKit.shortCopy')}
      description={t('mediaKit.desc.shortCopy')}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <Card variant="interactive" padding="lg"
            key={item.labelKey}
            className="flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-widest text-lc-green">
                {t(item.labelKey)}
              </div>
              <div className="text-sm truncate">{item.value}</div>
            </div>
            <CopyButton text={item.value} />
          </Card>
        ))}
      </div>
    </Section>
  );
}
