'use client';

import Container from '@/components/ui/layout/Container';
import Card from '@/components/ui/layout/Card';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import Button from '@/components/ui/buttons/Button';
import Reveal from '@/components/ui/animations/Reveal';
import { LogInIcon } from '@/assets/icons';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/**
 * Product preview: desktop + mobile screenshots that link out to the
 * per-device tour pages (/desktop and /mobile). Each card shows a real
 * product screenshot with descriptive alt text for SEO; the CTAs below
 * bounce visitors straight into /app.
 */
export default function PreviewSection({ onLaunch }: { onLaunch: () => void }) {
  const t = useTranslations();
  return (
    <Reveal id="preview" className="pt-12 pb-16 px-6">
      <Container width="6xl">
        <div className="text-center mb-12">
          <Heading as="h2" variant="section" className="mb-4">
            {t('marketing.landing.preview.heading')}
          </Heading>
          <Text as="p" variant="lead" className="max-w-2xl mx-auto">
            {t('marketing.landing.preview.subtitle')}
          </Text>
        </div>

        <Container width="5xl" className="space-y-6">
          {/* Desktop card: image left, content right on lg+ (image on top, content below on small) */}
          <Card variant="interactive" padding="2xl" asChild>
            <Link
              href="/desktop"
              className="group lg:p-8 flex flex-col lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-10 lg:items-center"
              data-testid="landing-preview-desktop"
            >
              <figure className="rounded-xl border border-lc-border overflow-hidden bg-lc-dark">
                <Image
                  src="/pictures-for-posts/desktop-large-voice-channel-with-sfu-peer-trasmission-test.png"
                  alt={t('marketing.landing.preview.desktop.alt')}
                  width={1470}
                  height={799}
                  className="w-full h-auto block transition-transform duration-500 group-hover:scale-[1.015]"
                  sizes="(max-width: 1024px) 90vw, 600px"
                />
              </figure>
              <div className="mt-6 lg:mt-0 flex flex-col">
                <span className="self-start inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lc-olive/40 border border-lc-green/20 text-xs font-semibold text-lc-green tracking-wide uppercase">
                  {t('marketing.landing.preview.desktop.badge')}
                </span>
                <Heading as="h3" className="mt-4 text-xl md:text-2xl font-bold text-lc-white">
                  {t('marketing.landing.preview.desktop.title')}
                </Heading>
                <Text as="p" variant="muted" className="mt-2 md:text-base leading-relaxed">
                  {t('marketing.landing.preview.desktop.desc')}
                </Text>
                <span className="mt-6 text-sm font-semibold text-lc-green inline-flex items-center gap-2 group-hover:underline">
                  {t('marketing.landing.preview.desktop.cta')}
                  <span aria-hidden="true">→</span>
                </span>
              </div>
            </Link>
          </Card>

          {/* Mobile card: content left, phone right on lg+ (phone on top, content below on small) */}
          <Card variant="interactive" padding="2xl" asChild>
            <Link
              href="/mobile"
              className="group lg:p-8 flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-10 lg:items-center"
              data-testid="landing-preview-mobile"
            >
              <figure className="lg:order-2 mx-auto w-full max-w-[200px] lg:mx-0 lg:max-w-none lg:w-full rounded-[2rem] border border-lc-border overflow-hidden bg-lc-dark">
                <Image
                  src="/pictures-for-posts/mobile-server-and-channels-view.png"
                  alt={t('marketing.landing.preview.mobile.alt')}
                  width={720}
                  height={1600}
                  className="w-full h-auto block transition-transform duration-500 group-hover:scale-[1.015]"
                  sizes="(max-width: 1024px) 60vw, 220px"
                />
              </figure>
              <div className="lg:order-1 mt-6 lg:mt-0 flex flex-col">
                <span className="self-start inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lc-olive/40 border border-lc-green/20 text-xs font-semibold text-lc-green tracking-wide uppercase">
                  {t('marketing.landing.preview.mobile.badge')}
                </span>
                <Heading as="h3" className="mt-4 text-xl md:text-2xl font-bold text-lc-white">
                  {t('marketing.landing.preview.mobile.title')}
                </Heading>
                <Text as="p" variant="muted" className="mt-2 md:text-base leading-relaxed">
                  {t('marketing.landing.preview.mobile.desc')}
                </Text>
                <span className="mt-6 text-sm font-semibold text-lc-green inline-flex items-center gap-2 group-hover:underline">
                  {t('marketing.landing.preview.mobile.cta')}
                  <span aria-hidden="true">→</span>
                </span>
              </div>
            </Link>
          </Card>
        </Container>

        <div className="mt-10 flex justify-center">
          <Button variant="pill" size="lg" onClick={() => onLaunch()}>
            <LogInIcon size={18} strokeWidth={2.5} />
            {t('marketing.hero.launchApp')}
          </Button>
        </div>
      </Container>
    </Reveal>
  );
}
