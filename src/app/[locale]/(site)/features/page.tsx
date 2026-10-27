import Card from '@/components/ui/layout/Card';
import MarketingPageHeader from '@/components/marketing/site/MarketingPageHeader';
import MarketingCta from '@/components/marketing/site/MarketingCta';
import Container from '@/components/ui/layout/Container';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from '@/components/ui/navigation/Link';
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
    image: '/pictures-for-posts/desktop-channel-chat.png',
    width: 1470, height: 799,
  },
  {
    id: 'voiceMessages',
    image: '/pictures-for-posts/desktop-voice-note.png',
    width: 1470, height: 799,
  },
  {
    id: 'stickers',
    image: '/pictures-for-posts/desktop-emoji-picker.png',
    width: 1470, height: 799,
  },
  {
    id: 'games',
    image: '/og/guides/games/games-feature.png',
    width: 2360, height: 1004,
  },
  {
    id: 'pwa',
    image: '/pictures-for-posts/mobile-showcase.png',
    width: 2400, height: 1680,
  },
  {
    id: 'p2p',
    image: '/pictures-for-posts/desktop-voice-call.png',
    width: 1130, height: 799,
  },
  {
    id: 'sfu',
    image: '/pictures-for-posts/desktop-voice-call.png',
    width: 1130, height: 799,
  },
  {
    id: 'profiles',
    image: '/pictures-for-posts/desktop-profile-card.png',
    width: 1470, height: 799,
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
    <main className="min-h-screen relative">
      <ShootingStars />
      <div className="relative z-10">
        <MarketingPageHeader
          eyebrow={t('marketing.features.eyebrow')}
          title={<>{t('marketing.features.headline')}<span className="text-lc-green lc-glow-text"> {t('marketing.features.headlineAccent')}</span></>}
          description={t('marketing.features.subhead')}
        >
            <Link href="/app" prefetch={false} variant="button" buttonVariant="pill" size="lg">{t('marketing.features.openApp')}</Link>
            <Link href="https://github.com/obelisk-app/obelisk" variant="button" buttonVariant="pillSecondary" size="lg" target="_blank">{t('marketing.features.viewSource')}</Link>
        </MarketingPageHeader>

        <Container width="6xl" as="section" className="space-y-24 px-6 py-12 lg:space-y-32">
          {FEATURES.map((feature, index) => (
            <article key={feature.id} className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-16">
              <figure className={index % 2 ? 'lg:order-2' : ''}>
                <Card padding="none" radius="2xl" className="overflow-hidden shadow-[0_40px_120px_-40px_rgba(180,249,83,0.18)]">
                  <Image src={feature.image} alt={t(`marketing.features.item.${feature.id}.alt`)} width={feature.width} height={feature.height} className="block h-auto w-full" sizes="(max-width: 1024px) 90vw, 680px" />
                </Card>
              </figure>
              <div>
                <Text as="p" size="xs" tone="accent" weight="semibold" className="uppercase tracking-[0.18em]">{t('marketing.features.number', { n: String(index + 1).padStart(2, '0') })}</Text>
                <Heading as="h2" variant="section" accent={false} className="mt-3 tracking-tight">{t(`marketing.features.item.${feature.id}.title`)}</Heading>
                <Text as="p" size="base" tone="muted" className="mt-4 leading-relaxed md:text-lg">{t(`marketing.features.item.${feature.id}.description`)}</Text>
              </div>
            </article>
          ))}
        </Container>

        <MarketingCta title={t('marketing.features.ctaTitle')} description={t('marketing.features.ctaBody')}>
          <Link href="/app" prefetch={false} variant="button" buttonVariant="pill" size="lg">{t('marketing.features.ctaButton')}</Link>
        </MarketingCta>

      </div>
    </main>
  );
}
