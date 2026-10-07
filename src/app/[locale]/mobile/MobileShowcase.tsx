'use client';

import { Link } from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import Navbar from '@/components/marketing/site/Navbar';
import Footer from '@/components/marketing/site/Footer';
import ShootingStars from '@/components/common/ShootingStars';
import { ShowcaseRow, type ShowcaseItem } from '@/components/marketing/showcase/Showcase';
import { useTranslations } from 'next-intl';
import Button, { buttonClass } from '@/components/ui/buttons/Button';

export default function MobileShowcase() {
  const t = useTranslations();
  const router = useRouter();

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
    <main className="min-h-screen bg-lc-black appearance-bg lc-grid-bg relative">
      <ShootingStars />
      <div className="relative z-10">
        <Navbar />

        <section className="pt-32 pb-12 px-6 text-center">
          <div className="max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lc-olive/40 border border-lc-green/20 text-xs font-semibold text-lc-green tracking-wide uppercase">
              {t('showcase.mobile.hero.badge')}
            </span>
            <h1 className="mt-5 text-4xl md:text-6xl font-extrabold text-lc-white leading-[1.05] tracking-tight">
              {t('showcase.mobile.hero.title')}{' '}
              <span className="text-lc-green lc-glow-text">
                {t('showcase.mobile.hero.titleHighlight')}
              </span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-lc-muted max-w-2xl mx-auto leading-relaxed">
              {t('showcase.mobile.hero.subtitle')}
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                variant="pill"
                size="lg"
                onClick={() => router.push('/app')}
              >
                {t('showcase.mobile.hero.cta')}
              </Button>
              <Link
                href="/desktop"
                className={buttonClass({ variant: 'pillSecondary', size: 'lg' })}
              >
                {t('showcase.mobile.hero.ctaSecondary')}
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
                {t('showcase.mobile.cta.heading')}<span className="text-lc-green">.</span>
              </h2>
              <p className="text-lc-muted text-lg mb-8 max-w-lg mx-auto">
                {t('showcase.mobile.cta.subtitle')}
              </p>
              <Button
                variant="pill"
                size="lg"
                onClick={() => router.push('/app')}
              >
                {t('showcase.mobile.cta.button')}
              </Button>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
