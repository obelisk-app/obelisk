'use client';

import Card from '@/components/ui/layout/Card';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ASSETS, PITCHES } from '@/constants/media-kit/content';
import { CopyButton } from './CopyButton';
import Section from '@/components/ui/layout/Section';
import Text from '@/components/ui/layout/Text';

/** The pitches (short and long, in the page language) and the downloadable logos and icons. */
export function AboutSections() {
  const t = useTranslations();
  return (
    <>
      {/* About */}
      <Section
        id="about"
        title={t('mediaKit.about')}
        description={t('mediaKit.desc.about')}
      >
        <div className="grid gap-4 md:grid-cols-2">
          {PITCHES.map(({ labelKey, textKey }) => (
            <Card variant="interactive" padding="xl" key={labelKey} className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-widest text-lc-green">
                  {t(labelKey)}
                </span>
                <CopyButton text={t(textKey)} />
              </div>
              <Text as="p" size="sm" tone="default">{t(textKey)}</Text>
            </Card>
          ))}
        </div>
      </Section>

      {/* Logos */}
      <Section
        id="logos"
        title={t('mediaKit.logos')}
        description={t('mediaKit.desc.logos')}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ASSETS.map((a) => (
            <Card variant="interactive" padding="none" key={a.src} className="overflow-hidden">
              <div
                className={`${a.bg} flex items-center justify-center p-6 h-48`}
              >
                <Image
                  src={a.src}
                  alt={t(a.labelKey)}
                  width={180}
                  height={180}
                  className="max-h-full max-w-full object-contain"
                  unoptimized
                />
              </div>
              <div className="border-t border-lc-border p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {t(a.labelKey)}
                  </div>
                  <div className="text-xs text-lc-muted truncate">
                    {a.src}
                  </div>
                </div>
                <a
                  href={a.src}
                  download={a.download}
                  className="lc-pill-primary text-xs px-3 py-1 shrink-0"
                >
                  {t('mediaKit.download')}
                </a>
              </div>
            </Card>
          ))}
        </div>
      </Section>
    </>
  );
}
