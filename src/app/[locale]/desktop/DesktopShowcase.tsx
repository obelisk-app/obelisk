'use client';

import { Link } from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import Navbar from '@/components/marketing/site/Navbar';
import Footer from '@/components/marketing/site/Footer';
import ShootingStars from '@/components/ui/animations/ShootingStars';
import { ShowcaseRow, type ShowcaseItem } from '@/components/marketing/showcase/Showcase';
import { useTranslations } from 'next-intl';
import Button, { buttonClass } from '@/components/ui/buttons/Button';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

export default function DesktopShowcase() {
  const t = useTranslations();
  const router = useRouter();

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
    <main className="min-h-screen bg-lc-black appearance-bg lc-grid-bg relative">
      <ShootingStars />
      <div className="relative z-10">
        <Navbar />

        <section className="pt-32 pb-12 px-6 text-center">
          <div className="max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lc-olive/40 border border-lc-green/20 text-xs font-semibold text-lc-green tracking-wide uppercase">
              {t('showcase.desktop.hero.badge')}
            </span>
            <Heading as="h1" variant="display" className="mt-5">
              {t('showcase.desktop.hero.title')}{' '}
              <span className="text-lc-green lc-glow-text">
                {t('showcase.desktop.hero.titleHighlight')}
              </span>
            </Heading>
            <Text as="p" variant="lead" className="mt-6 md:text-xl max-w-2xl mx-auto leading-relaxed">
              {t('showcase.desktop.hero.subtitle')}
            </Text>
            <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                variant="pill"
                size="lg"
                onClick={() => router.push('/app')}
              >
                {t('showcase.desktop.hero.cta')}
              </Button>
              <Link
                href="/mobile"
                className={buttonClass({ variant: 'pillSecondary', size: 'lg' })}
              >
                {t('showcase.desktop.hero.ctaSecondary')}
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
              <Heading as="h2" variant="section" className="mb-4">
                {t('showcase.desktop.cta.heading')}
              </Heading>
              <Text as="p" variant="lead" className="mb-8 max-w-lg mx-auto">
                {t('showcase.desktop.cta.subtitle')}
              </Text>
              <Button
                variant="pill"
                size="lg"
                onClick={() => router.push('/app')}
              >
                {t('showcase.desktop.cta.button')}
              </Button>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
