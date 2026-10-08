'use client';

import { useTranslations } from 'next-intl';
import { COLORS } from '@/constants/media-kit/content';
import { CopyButton } from './CopyButton';
import Section from '@/components/ui/layout/Section';

/** The palette tokens, each with its HEX to copy. */
export function PaletteSection() {
  const t = useTranslations();
  return (
    <Section
      id="colors"
      title={t('mediaKit.palette')}
      description={t('mediaKit.desc.palette')}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {COLORS.map((c) => (
          <div key={c.token} className="lc-card overflow-hidden">
            <div
              className="h-24 border-b border-lc-border"
              style={{ backgroundColor: c.hex }}
            />
            <div className="p-4 flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{t(c.nameKey)}</div>
                <div className="text-xs text-lc-muted">
                  {c.token} · {t(c.usageKey)}
                </div>
              </div>
              <CopyButton text={c.hex} />
            </div>
            <div className="px-4 pb-4 -mt-2 text-xs text-lc-muted font-mono">
              {c.hex}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
