'use client';

/**
 * The press and media kit page: logos, banners, palette, copy and embeds.
 * The data is `src/utils/media-kit/content.ts`; each group of sections is its
 * own component under `kit/`. Typography and contact stay here; the type
 * specimens are the brand asset itself and carry `i18n-exempt` markers.
 */
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { LINKS, NAV_LINKS } from '@/utils/media-kit/content';
import { Section } from './kit/Section';
import { AboutSections } from './kit/AboutSections';
import { BannersSection } from './kit/BannersSection';
import { EmbedSections } from './kit/EmbedSections';
import { PaletteSection } from './kit/PaletteSection';
import { ShortCopySection } from './kit/ShortCopySection';
import { GuidelinesSection } from './kit/GuidelinesSection';

export default function MediaKit() {
  const t = useTranslations();
  return (
    <main className="min-h-screen bg-lc-black text-lc-white">
      {/* Hero */}
      <header className="border-b border-lc-border">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-20">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-lc-green">
            <span className="inline-block w-2 h-2 rounded-full bg-lc-green lc-glow" />
            {t('mediaKit.eyebrow')}
          </div>
          <h1 className="mt-4 text-4xl sm:text-6xl font-extrabold tracking-tight">
            {t('mediaKit.title')}
          </h1>
          <p className="mt-4 max-w-2xl text-base sm:text-lg text-lc-muted">
            {t('mediaKit.intro')}
          </p>

          <nav className="mt-8 flex flex-wrap gap-2 text-sm">
            {NAV_LINKS.map(([href, labelKey]) => (
              <a
                key={href}
                href={href}
                className="lc-pill-secondary px-3 py-1"
              >
                {t(labelKey)}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16 space-y-16">
        <AboutSections />

        <BannersSection />

        <PaletteSection />

        {/* Typography */}
        <Section
          id="typography"
          title={t('mediaKit.typography')}
          description={t('mediaKit.desc.typography')}
        >
          <div className="lc-card p-6 space-y-4">
            <div className="text-5xl font-extrabold tracking-tight"> {/* i18n-exempt: type specimen, the brand asset itself */}
              Aa - Obelisk
            </div>
            <div className="text-2xl font-bold"> {/* i18n-exempt: type specimen, the brand asset itself */}
              Heading · 700 · tracking-tight
            </div>
            <div className="text-base">Body · 400 · text-lc-white</div> {/* i18n-exempt: type specimen, the brand asset itself */}
            <div className="text-sm text-lc-muted"> {/* i18n-exempt: type specimen, the brand asset itself */}
              Muted · 400 · text-lc-muted, used for secondary descriptions
            </div>
            <div className="text-xs uppercase tracking-widest text-lc-green"> {/* i18n-exempt: type specimen, the brand asset itself */}
              Eyebrow · uppercase · tracking-widest · lc-green
            </div>
          </div>
        </Section>

        <ShortCopySection />

        <EmbedSections />

        {/* Contact */}
        <Section
          id="contact"
          title={t('mediaKit.contact')}
          description={t('mediaKit.desc.contact')}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <a
              href={LINKS.site}
              target="_blank"
              rel="noopener noreferrer"
              className="lc-card p-5 hover:border-lc-green transition-colors"
            >
              <div className="text-xs uppercase tracking-widest text-lc-green mb-1">
                {t('mediaKit.website')}
              </div>
              <div className="text-sm text-lc-white truncate">
                {LINKS.site}
              </div>
            </a>
            <a
              href={LINKS.github}
              target="_blank"
              rel="noopener noreferrer"
              className="lc-card p-5 hover:border-lc-green transition-colors"
            >
              <div className="text-xs uppercase tracking-widest text-lc-green mb-1">
                GitHub
              </div>
              <div className="text-sm text-lc-white truncate">
                {LINKS.github}
              </div>
            </a>
            <div className="lc-card p-5">
              <div className="text-xs uppercase tracking-widest text-lc-green mb-1">
                {t('mediaKit.defaultRelay')}
              </div>
              <div className="text-sm text-lc-white truncate font-mono">
                {LINKS.defaultRelay}
              </div>
            </div>
          </div>
        </Section>

        <GuidelinesSection />

        <footer className="pt-8 border-t border-lc-border text-sm text-lc-muted flex flex-wrap items-center justify-between gap-3">
          <span>
            {t('mediaKit.needAnythingElse')}
          </span>
          <Link href="/" className="lc-pill-secondary px-4 py-1">
            {t('mediaKit.backHome')}
          </Link>
        </footer>
      </div>
    </main>
  );
}
