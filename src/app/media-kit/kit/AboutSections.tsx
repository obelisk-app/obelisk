'use client';

import Image from 'next/image';
import { useTranslation } from '@/i18n/context';
import { ASSETS, PITCHES } from './content';
import { CopyButton, Section } from './kit-ui';

/** The pitches (EN/ES, short and long) and the downloadable logos and icons. */
export function AboutSections() {
  const { t } = useTranslation();
  return (
    <>
      {/* About */}
      <Section
        id="about"
        title={t('mediaKit.about')}
        description="Short and long pitch: English and Spanish, ready to copy."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {PITCHES.map(([label, text]) => (
            <div key={label} className="lc-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-widest text-lc-green">
                  {label}
                </span>
                <CopyButton text={text} />
              </div>
              <p className="text-sm text-lc-white">{text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Logos */}
      <Section
        id="logos"
        title={t('mediaKit.logos')}
        description="Right-click → Save image as… or use the Download button."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ASSETS.map((a) => (
            <div key={a.src} className="lc-card overflow-hidden">
              <div
                className={`${a.bg} flex items-center justify-center p-6 h-48`}
              >
                <Image
                  src={a.src}
                  alt={a.label}
                  width={180}
                  height={180}
                  className="max-h-full max-w-full object-contain"
                  unoptimized
                />
              </div>
              <div className="border-t border-lc-border p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {a.label}
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
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
