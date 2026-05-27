'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ShootingStars from '@/components/ShootingStars';
import { ShowcaseRow, type ShowcaseItem } from '@/components/Showcase';
import { useTranslation } from '@/i18n/context';

export default function MobileShowcase() {
  const { t } = useTranslation();
  const router = useRouter();

  const items: ShowcaseItem[] = [
    {
      src: '/pictures-for-posts/mobile-server-and-channels-view.png',
      alt: t('mobile.shot1.alt'),
      width: 720,
      height: 1600,
      orientation: 'portrait',
      badge: t('mobile.shot1.badge'),
      title: t('mobile.shot1.title'),
      description: t('mobile.shot1.desc'),
      features: t('mobile.shot1.features').split('|'),
      priority: true,
    },
    {
      src: '/pictures-for-posts/mobile-channel-view-with-sfu-test-peer-trasmission.png',
      alt: t('mobile.shot2.alt'),
      width: 720,
      height: 1600,
      orientation: 'portrait',
      badge: t('mobile.shot2.badge'),
      title: t('mobile.shot2.title'),
      description: t('mobile.shot2.desc'),
      features: t('mobile.shot2.features').split('|'),
    },
    {
      src: '/pictures-for-posts/mobile-login-modal.png',
      alt: t('mobile.shot3.alt'),
      width: 720,
      height: 1600,
      orientation: 'portrait',
      badge: t('mobile.shot3.badge'),
      title: t('mobile.shot3.title'),
      description: t('mobile.shot3.desc'),
      features: t('mobile.shot3.features').split('|'),
    },
    {
      src: '/pictures-for-posts/mobile-own-profile-view.png',
      alt: t('mobile.shot4.alt'),
      width: 720,
      height: 1600,
      orientation: 'portrait',
      badge: t('mobile.shot4.badge'),
      title: t('mobile.shot4.title'),
      description: t('mobile.shot4.desc'),
      features: t('mobile.shot4.features').split('|'),
    },
  ];

  return (
    <main className="min-h-screen bg-lc-black appearance-bg lc-grid-bg relative">
      <ShootingStars />
      <div className="relative z-10">
        <Navbar />

        <section className="pt-32 pb-12 px-6 text-center">
          <div className="max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lc-olive/40 border border-lc-green/20 text-xs font-semibold text-lc-green tracking-wide uppercase">
              {t('mobile.hero.badge')}
            </span>
            <h1 className="mt-5 text-4xl md:text-6xl font-extrabold text-lc-white leading-[1.05] tracking-tight">
              {t('mobile.hero.title')}{' '}
              <span className="text-lc-green lc-glow-text">
                {t('mobile.hero.titleHighlight')}
              </span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-lc-muted max-w-2xl mx-auto leading-relaxed">
              {t('mobile.hero.subtitle')}
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => router.push('/app')}
                className="lc-pill lc-pill-primary text-base px-8 py-3"
              >
                {t('mobile.hero.cta')}
              </button>
              <Link
                href="/desktop"
                className="lc-pill lc-pill-secondary text-base px-8 py-3"
              >
                {t('mobile.hero.ctaSecondary')}
              </Link>
            </div>
          </div>
        </section>

        <section className="px-6">
          <div className="max-w-6xl mx-auto py-8 lg:py-16 space-y-24 lg:space-y-32">
            {items.map((item, i) => (
              <ShowcaseRow key={item.src} item={item} index={i} />
            ))}
          </div>
        </section>

        <section className="px-6 py-24">
          <div className="max-w-3xl mx-auto text-center">
            <div className="lc-card p-12 lc-glow">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                {t('mobile.cta.heading')}<span className="text-lc-green">.</span>
              </h2>
              <p className="text-lc-muted text-lg mb-8 max-w-lg mx-auto">
                {t('mobile.cta.subtitle')}
              </p>
              <button
                onClick={() => router.push('/app')}
                className="lc-pill lc-pill-primary text-base px-10 py-3.5"
              >
                {t('mobile.cta.button')}
              </button>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
