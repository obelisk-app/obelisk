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
  page: 'desktop',
  shots: [
    { path: '/pictures-for-posts/dekstop-public-general-chat-view-with-member-list.png', nameKey: 'seo.desktop.shots.chat', width: 1470, height: 799 },
    { path: '/pictures-for-posts/desktop-forums-view.png', nameKey: 'seo.desktop.shots.publications', width: 1470, height: 799 },
    { path: '/pictures-for-posts/desktop-large-voice-channel-with-sfu-peer-trasmission-test.png', nameKey: 'seo.desktop.shots.voice', width: 1470, height: 799 },
  ],
  keywords: [
    'Discord alternative desktop', 'Nostr desktop chat', 'NIP-29 group chat', 'mediasoup SFU voice',
    'self-hosted Discord', 'Nostr publications', 'encrypted group DMs', 'Lightning zaps chat',
    'Web of Trust chat', 'open source Discord',
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return tourMetadata(TOUR, await getTranslations({ locale }), locale);
}

export default async function DesktopPage() {
  const locale = await getLocale();
  const t = await getTranslations({ locale });
  const jsonLd = tourJsonLd(TOUR, t, locale);
  const items: ShowcaseItem[] = [
    {
      src: '/pictures-for-posts/dekstop-public-general-chat-view-with-member-list.png',
      alt: t('showcase.desktop.shot1.alt'),
      width: 1470,
      height: 799,
      orientation: 'landscape',
      badge: t('showcase.desktop.shot1.badge'),
      title: t('showcase.desktop.shot1.title'),
      description: t('showcase.desktop.shot1.desc'),
      features: t('showcase.desktop.shot1.features').split('|'),
      priority: true,
    },
    {
      src: '/pictures-for-posts/desktop-forums-view.png',
      alt: t('showcase.desktop.shot2.alt'),
      width: 1470,
      height: 799,
      orientation: 'landscape',
      badge: t('showcase.desktop.shot2.badge'),
      title: t('showcase.desktop.shot2.title'),
      description: t('showcase.desktop.shot2.desc'),
      features: t('showcase.desktop.shot2.features').split('|'),
    },
    {
      src: '/pictures-for-posts/desktop-large-voice-channel-with-sfu-peer-trasmission-test.png',
      alt: t('showcase.desktop.shot3.alt'),
      width: 1470,
      height: 799,
      orientation: 'landscape',
      badge: t('showcase.desktop.shot3.badge'),
      title: t('showcase.desktop.shot3.title'),
      description: t('showcase.desktop.shot3.desc'),
      features: t('showcase.desktop.shot3.features').split('|'),
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
            eyebrow={t('showcase.desktop.hero.badge')}
            title={<>{t('showcase.desktop.hero.title')} <span className="text-lc-green lc-glow-text">{t('showcase.desktop.hero.titleHighlight')}</span></>}
            description={t('showcase.desktop.hero.subtitle')}
          >
                <Link href="/app" prefetch={false} className={buttonClass({ variant: 'pill', size: 'lg' })}>
                  {t('showcase.desktop.hero.cta')}
                </Link>
                <Link
                  href="/mobile"
                  className={buttonClass({ variant: 'pillSecondary', size: 'lg' })}
                >
                  {t('showcase.desktop.hero.ctaSecondary')}
                </Link>
          </MarketingPageHeader>

          <PageSection className="py-8 lg:py-16">
            <Container width="6xl" className="space-y-24 lg:space-y-32">
              {items.map((item, i) => (
                <ShowcaseRow key={item.src} item={item} index={i} />
              ))}
            </Container>
          </PageSection>

          <MarketingCta title={t('showcase.desktop.cta.heading')} description={t('showcase.desktop.cta.subtitle')}>
            <Link href="/app" prefetch={false} className={buttonClass({ variant: 'pill', size: 'lg' })}>
              {t('showcase.desktop.cta.button')}
            </Link>
          </MarketingCta>

          <Footer />
        </div>
      </main>
    </IntlScope>
  );
}
