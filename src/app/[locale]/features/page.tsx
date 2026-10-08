import Container from '@/components/ui/layout/Container';
import PageSection from '@/components/ui/layout/PageSection';
import Card from '@/components/ui/layout/Card';
import Stack from '@/components/ui/layout/Stack';
import type { Metadata } from 'next';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import Footer from '@/components/marketing/site/Footer';
import Navbar from '@/components/marketing/site/Navbar';
import ShootingStars from '@/components/ui/animations/ShootingStars';
import { getLocale, getTranslations } from 'next-intl/server';
import { standardPageMetadata } from '@/utils/seo/standard';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/**
 * The screenshots. Their copy - title, description, and the alt text a
 * screen reader reads - lives in the dictionary under `marketing.features.item.<id>`,
 * because this page is the app's shop window and shipped English to every
 * reader regardless of language.
 */
const FEATURES = [
  {
    id: 'groups',
    image: '/pictures-for-posts/dekstop-public-general-chat-view-with-member-list.png',
    width: 1470, height: 799,
  },
  {
    id: 'voiceMessages',
    image: '/pictures-for-posts/voice-messages.png',
    width: 2940, height: 1678,
  },
  {
    id: 'stickers',
    image: '/pictures-for-posts/stickers-marketplace.png',
    width: 2940, height: 1596,
  },
  {
    id: 'games',
    image: '/og/guides/games/games-feature.png',
    width: 2360, height: 1004,
  },
  {
    id: 'pwa',
    image: '/pictures-for-posts/mobile-showcase-readme.png',
    width: 3320, height: 1840,
  },
  {
    id: 'p2p',
    image: '/pictures-for-posts/desktop-large-voice-channel-with-sfu-peer-trasmission-test.png',
    width: 1470, height: 799,
  },
  {
    id: 'sfu',
    image: '/pictures-for-posts/desktop-large-voice-channel-with-sfu-peer-trasmission-test.png',
    width: 1470, height: 799,
  },
  {
    id: 'profiles',
    image: '/pictures-for-posts/voice-messages.png',
    width: 2940, height: 1678,
  },
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations({ locale });
  return standardPageMetadata(t, locale, 'features', {
    // Search terms, not copy: these are what people type into a search box,
    // and they are typed in English even by readers browsing in Spanish.
    keywords: [
      'Nostr chat features',
      'NIP-29 group chat',
      'Discord alternative features',
      'Nostr voice and video calls',
      'Nostr mobile PWA',
      'Nostr sticker marketplace',
      'Nostr multiplayer games',
      'self-hosted community chat',
    ],
  });
}

export default async function FeaturesPage() {
  const locale = await getLocale();
  const t = await getTranslations({ locale });

  return (
    <main className="min-h-screen bg-lc-black appearance-bg lc-grid-bg relative">
      <ShootingStars />
      <div className="relative z-10">
        <Navbar />
        <header className="px-6 pb-16 pt-32 text-center">
          <span className="inline-flex rounded-full border border-lc-green/20 bg-lc-olive/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-lc-green">{t('marketing.features.eyebrow')}</span>
          <Heading as="h1" variant="display" className="mx-auto mt-5 max-w-4xl">
            {t('marketing.features.headline')}<span className="text-lc-green lc-glow-text"> {t('marketing.features.headlineAccent')}</span>
          </Heading>
          <Text as="p" variant="lead" className="mx-auto mt-6 max-w-2xl leading-relaxed md:text-xl">
            {t('marketing.features.subhead')}
          </Text>
          <Stack gap="3" className="mt-9 justify-center sm:flex-row">
            <Link href="/app" className="lc-pill lc-pill-primary px-8 py-3 text-base">{t('marketing.features.openApp')}</Link>
            <a href="https://github.com/obelisk-app/obelisk" className="lc-pill lc-pill-secondary px-8 py-3 text-base" target="_blank" rel="noopener noreferrer">{t('marketing.features.viewSource')}</a>
          </Stack>
        </header>

        <Container width="6xl" as="section" className="space-y-24 px-6 py-12 lg:space-y-32">
          {FEATURES.map((feature, index) => (
            <article key={feature.id} className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-16">
              <figure className={index % 2 ? 'lg:order-2' : ''}>
                <div className="overflow-hidden rounded-2xl border border-lc-border bg-lc-dark shadow-[0_40px_120px_-40px_rgba(180,249,83,0.18)]">
                  <Image src={feature.image} alt={t(`marketing.features.item.${feature.id}.alt`)} width={feature.width} height={feature.height} className="block h-auto w-full" sizes="(max-width: 1024px) 90vw, 680px" />
                </div>
              </figure>
              <div>
                <Text as="p" size="xs" tone="accent" weight="semibold" className="uppercase tracking-[0.18em]">{t('marketing.features.number', { n: String(index + 1).padStart(2, '0') })}</Text>
                <Heading as="h2" variant="section" accent={false} className="mt-3 tracking-tight">{t(`marketing.features.item.${feature.id}.title`)}</Heading>
                <Text as="p" size="base" tone="muted" className="mt-4 leading-relaxed md:text-lg">{t(`marketing.features.item.${feature.id}.description`)}</Text>
              </div>
            </article>
          ))}
        </Container>

        <PageSection className="text-center">
          <Card variant="interactive" glow padding="heroResponsive" asChild>
            <Container width="3xl">
              <Heading as="h2" variant="section" accent={false}>{t('marketing.features.ctaTitle')}</Heading>
              <Text as="p" variant="lead" className="mx-auto mt-4 max-w-xl">{t('marketing.features.ctaBody')}</Text>
              <Link href="/app" className="lc-pill lc-pill-primary mt-8 inline-flex px-10 py-3.5 text-base">{t('marketing.features.ctaButton')}</Link>
            </Container>
          </Card>
        </PageSection>
        <Footer />
      </div>
    </main>
  );
}
