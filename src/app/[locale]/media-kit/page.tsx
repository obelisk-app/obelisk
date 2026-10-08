import Container from '@/components/ui/layout/Container';
import Card from '@/components/ui/layout/Card';
import { Link } from '@/i18n/navigation';
import { LINKS, NAV_LINKS } from '@/constants/media-kit/content';
import Section from '@/components/ui/layout/Section';
import { AboutSections } from './kit/AboutSections';
import { BannersSection } from './kit/BannersSection';
import { EmbedSections } from './kit/EmbedSections';
import { PaletteSection } from './kit/PaletteSection';
import { ShortCopySection } from './kit/ShortCopySection';
import { GuidelinesSection } from './kit/GuidelinesSection';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import IntlScope from '@/i18n/IntlScope';
import { standardPageMetadata } from '@/utils/seo/standard';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations({ locale });
  return standardPageMetadata(t, locale, 'mediaKit');
}

export default async function Page() {
  const t = await getTranslations();
  return (
    <IntlScope scope="mediaKit">
      <main className="min-h-screen bg-lc-black text-lc-white">
        {/* Hero */}
        <header className="border-b border-lc-border">
          <Container width="6xl" className="px-4 sm:px-6 py-12 sm:py-20">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-lc-green">
              <span className="inline-block w-2 h-2 rounded-full bg-lc-green lc-glow" />
              {t('mediaKit.eyebrow')}
            </div>
            <Heading as="h1" className="mt-4 text-4xl sm:text-6xl font-extrabold tracking-tight">
              {t('mediaKit.title')}
            </Heading>
            <Text as="p" size="base" tone="muted" className="mt-4 max-w-2xl sm:text-lg">
              {t('mediaKit.intro')}
            </Text>

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
          </Container>
        </header>

        <Container width="6xl" className="px-4 sm:px-6 py-12 sm:py-16 space-y-16">
          <AboutSections />

          <BannersSection />

          <PaletteSection />

          {/* Typography */}
          <Section
            id="typography"
            title={t('mediaKit.typography')}
            description={t('mediaKit.desc.typography')}
          >
            <Card variant="interactive" padding="2xl" className="space-y-4">
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
            </Card>
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
              <Card variant="interactive" padding="xl" asChild>
                <a
                  href={LINKS.site}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:border-lc-green transition-colors"
                >
                  <div className="text-xs uppercase tracking-widest text-lc-green mb-1">
                    {t('mediaKit.website')}
                  </div>
                  <div className="text-sm text-lc-white truncate">
                    {LINKS.site}
                  </div>
                </a>
              </Card>
              <Card variant="interactive" padding="xl" asChild>
                <a
                  href={LINKS.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:border-lc-green transition-colors"
                >
                  <div className="text-xs uppercase tracking-widest text-lc-green mb-1">
                    GitHub
                  </div>
                  <div className="text-sm text-lc-white truncate">
                    {LINKS.github}
                  </div>
                </a>
              </Card>
              <Card variant="interactive" padding="xl">
                <div className="text-xs uppercase tracking-widest text-lc-green mb-1">
                  {t('mediaKit.defaultRelay')}
                </div>
                <div className="text-sm text-lc-white truncate font-mono">
                  {LINKS.defaultRelay}
                </div>
              </Card>
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
        </Container>
      </main>
    </IntlScope>
  );
}
