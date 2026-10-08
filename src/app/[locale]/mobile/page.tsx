import MarketingPageHeader from '@/components/marketing/site/MarketingPageHeader';
import MarketingCta from '@/components/marketing/site/MarketingCta';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { tourJsonLd, tourMetadata, type Tour } from '@/utils/seo/showcase';
import JsonLd from '@/components/seo/JsonLd';
import IntlScope from '@/i18n/IntlScope';
import Container from '@/components/ui/layout/Container';
import PageSection from '@/components/ui/layout/PageSection';
import { Link } from '@/i18n/navigation';
import Navbar from '@/components/marketing/site/Navbar';
import Footer from '@/components/marketing/site/Footer';
import ShootingStars from '@/components/ui/animations/ShootingStars';
import { ShowcaseRow, type ShowcaseItem } from '@/components/marketing/showcase/Showcase';
import { buttonClass } from '@/utils/style/button-class';


const TOUR: Tour = {
  page: 'mobile',
  shots: [
    { path: '/pictures-for-posts/mobile-server-and-channels-view.png', nameKey: 'seo.mobile.shots.channels', width: 720, height: 1600 },
    { path: '/pictures-for-posts/mobile-channel-view-with-sfu-test-peer-trasmission.png', nameKey: 'seo.mobile.shots.voice', width: 720, height: 1600 },
    { path: '/pictures-for-posts/mobile-login-modal.png', nameKey: 'seo.mobile.shots.login', width: 720, height: 1600 },
    { path: '/pictures-for-posts/mobile-own-profile-view.png', nameKey: 'seo.mobile.shots.profile', width: 720, height: 1600 },
  ],
  keywords: [
    'mobile Discord alternative', 'Nostr mobile chat', 'mobile group chat app', 'NIP-29 mobile',
    'NIP-46 bunker mobile', 'Amber signer', 'mobile voice channels', 'PWA group chat',
    'crypto chat app', 'Web of Trust mobile', 'self-hosted Discord mobile',
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return tourMetadata(TOUR, await getTranslations({ locale }), locale);
}

export default async function MobilePage() {
  const locale = await getLocale();
  const t = await getTranslations({ locale });
  const jsonLd = tourJsonLd(TOUR, t, locale);
  const items: ShowcaseItem[] = [
    {
      src: '/pictures-for-posts/mobile-server-and-channels-view.png',
      alt: t('showcase.mobile.shot1.alt'),
      width: 720,
      height: 1600,
      orientation: 'portrait',
      badge: t('showcase.mobile.shot1.badge'),
      title: t('showcase.mobile.shot1.title'),
      description: t('showcase.mobile.shot1.desc'),
      features: t('showcase.mobile.shot1.features').split('|'),
      priority: true,
    },
    {
      src: '/pictures-for-posts/mobile-channel-view-with-sfu-test-peer-trasmission.png',
      alt: t('showcase.mobile.shot2.alt'),
      width: 720,
      height: 1600,
      orientation: 'portrait',
      badge: t('showcase.mobile.shot2.badge'),
      title: t('showcase.mobile.shot2.title'),
      description: t('showcase.mobile.shot2.desc'),
      features: t('showcase.mobile.shot2.features').split('|'),
    },
    {
      src: '/pictures-for-posts/mobile-login-modal.png',
      alt: t('showcase.mobile.shot3.alt'),
      width: 720,
      height: 1600,
      orientation: 'portrait',
      badge: t('showcase.mobile.shot3.badge'),
      title: t('showcase.mobile.shot3.title'),
      description: t('showcase.mobile.shot3.desc'),
      features: t('showcase.mobile.shot3.features').split('|'),
    },
    {
      src: '/pictures-for-posts/mobile-own-profile-view.png',
      alt: t('showcase.mobile.shot4.alt'),
      width: 720,
      height: 1600,
      orientation: 'portrait',
      badge: t('showcase.mobile.shot4.badge'),
      title: t('showcase.mobile.shot4.title'),
      description: t('showcase.mobile.shot4.desc'),
      features: t('showcase.mobile.shot4.features').split('|'),
    },
  ];

  return (
    <IntlScope scope="public">
      <JsonLd data={jsonLd} />
      <main className="min-h-screen bg-lc-black appearance-bg lc-grid-bg relative">
        <ShootingStars />
        <div className="relative z-10">
          <Navbar />

          <MarketingPageHeader
            eyebrow={t('showcase.mobile.hero.badge')}
            title={<>{t('showcase.mobile.hero.title')} <span className="text-lc-green lc-glow-text">{t('showcase.mobile.hero.titleHighlight')}</span></>}
            description={t('showcase.mobile.hero.subtitle')}
          >
                <Link href="/app" prefetch={false} className={buttonClass({ variant: 'pill', size: 'lg' })}>
                  {t('showcase.mobile.hero.cta')}
                </Link>
                <Link
                  href="/desktop"
                  className={buttonClass({ variant: 'pillSecondary', size: 'lg' })}
                >
                  {t('showcase.mobile.hero.ctaSecondary')}
                </Link>
          </MarketingPageHeader>

          <PageSection className="py-8 lg:py-16">
            <Container width="6xl" className="space-y-24 lg:space-y-32">
              {items.map((item, i) => (
                <ShowcaseRow key={item.src} item={item} index={i} />
              ))}
            </Container>
          </PageSection>

          <MarketingCta title={t('showcase.mobile.cta.heading')} description={t('showcase.mobile.cta.subtitle')}>
            <Link href="/app" prefetch={false} className={buttonClass({ variant: 'pill', size: 'lg' })}>
              {t('showcase.mobile.cta.button')}
            </Link>
          </MarketingCta>

          <Footer />
        </div>
      </main>
    </IntlScope>
  );
}
