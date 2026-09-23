import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';
import ShootingStars from '@/components/ShootingStars';
import { serverLocale } from '@/lib/server/locale';

const SITE_URL = process.env.CORS_ORIGIN || 'https://obelisk.ar';

/**
 * The screenshots. Their copy — title, description, and the alt text a
 * screen reader reads — lives in the dictionary under `features.item.<id>`,
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
  const { t } = await serverLocale();
  return {
    title: t('features.meta.title'),
    description: t('features.meta.description'),
    alternates: { canonical: '/features' },
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
    openGraph: {
      title: t('features.meta.ogTitle'),
      description: t('features.meta.ogDescription'),
      url: SITE_URL + '/features',
      siteName: 'Obelisk',
      type: 'website',
      images: [{
        url: '/pictures-for-posts/mobile-showcase-readme.png',
        width: 3320,
        height: 1840,
        alt: t('features.item.pwa.alt'),
      }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('features.meta.twitterTitle'),
      description: t('features.meta.twitterDescription'),
      images: ['/pictures-for-posts/mobile-showcase-readme.png'],
    },
  };
}

export default async function FeaturesPage() {
  const { t } = await serverLocale();

  return (
    <main className="min-h-screen bg-lc-black appearance-bg lc-grid-bg relative">
      <ShootingStars />
      <div className="relative z-10">
        <Navbar />
        <header className="px-6 pb-16 pt-32 text-center">
          <span className="inline-flex rounded-full border border-lc-green/20 bg-lc-olive/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-lc-green">{t('features.eyebrow')}</span>
          <h1 className="mx-auto mt-5 max-w-4xl text-4xl font-extrabold leading-[1.05] tracking-tight text-lc-white md:text-6xl">
            {t('features.headline')}<span className="text-lc-green lc-glow-text"> {t('features.headlineAccent')}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-lc-muted md:text-xl">
            {t('features.subhead')}
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/app" className="lc-pill lc-pill-primary px-8 py-3 text-base">{t('features.openApp')}</Link>
            <a href="https://github.com/obelisk-app/obelisk" className="lc-pill lc-pill-secondary px-8 py-3 text-base" target="_blank" rel="noopener noreferrer">{t('features.viewSource')}</a>
          </div>
        </header>

        <section className="mx-auto max-w-6xl space-y-24 px-6 py-12 lg:space-y-32">
          {FEATURES.map((feature, index) => (
            <article key={feature.id} className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-16">
              <figure className={index % 2 ? 'lg:order-2' : ''}>
                <div className="overflow-hidden rounded-2xl border border-lc-border bg-lc-dark shadow-[0_40px_120px_-40px_rgba(180,249,83,0.18)]">
                  <Image src={feature.image} alt={t(`features.item.${feature.id}.alt`)} width={feature.width} height={feature.height} className="block h-auto w-full" sizes="(max-width: 1024px) 90vw, 680px" />
                </div>
              </figure>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lc-green">{t('features.number')} {String(index + 1).padStart(2, '0')}</p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-lc-white md:text-4xl">{t(`features.item.${feature.id}.title`)}</h2>
                <p className="mt-4 text-base leading-relaxed text-lc-muted md:text-lg">{t(`features.item.${feature.id}.description`)}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="px-6 py-24 text-center">
          <div className="lc-card lc-glow mx-auto max-w-3xl p-10 md:p-12">
            <h2 className="text-3xl font-bold text-lc-white md:text-4xl">{t('features.ctaTitle')}</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-lc-muted">{t('features.ctaBody')}</p>
            <Link href="/app" className="lc-pill lc-pill-primary mt-8 inline-flex px-10 py-3.5 text-base">{t('features.ctaButton')}</Link>
          </div>
        </section>
        <Footer />
      </div>
    </main>
  );
}
