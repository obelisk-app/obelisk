'use client';

import Container from '@/components/ui/layout/Container';
import Stack from '@/components/ui/layout/Stack';
import { useTranslations } from 'next-intl';
import Button, { buttonClass } from '@/components/ui/buttons/Button';
import LandingHeroAnimation from './LandingHeroAnimation';
import HeroProductPreview from './HeroProductPreview';
import { LogInIcon } from '@/assets/icons';
import GitHubMark from '@/assets/brand/GitHubMark';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/**
 * The hero: headline, pitch, the launch and GitHub buttons, the animation and the screenshots.
 */
export default function LandingHero({ onLaunch }: { onLaunch: () => void }) {
  const t = useTranslations();
  return (
    <section
      data-testid="landing-hero"
      className="relative pt-20 pb-14 md:pt-24 md:pb-20 px-6 overflow-hidden"
    >
      <div className="absolute inset-0 bg-lc-black/35 pointer-events-none" aria-hidden="true" />
      <div className="absolute top-24 left-1/2 -translate-x-1/2 w-[520px] h-[520px] bg-lc-green/3 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-lc-black pointer-events-none" aria-hidden="true" />

      <Container width="6xl" className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center relative z-10">
        <LandingHeroAnimation />

        <div className="flex min-w-0 flex-col items-center text-center lg:items-start lg:text-left">
          <Heading as="h1" className="w-full max-w-[680px] text-4xl font-extrabold leading-[1.05] tracking-normal sm:text-5xl lg:text-6xl mb-4">
            {t('marketing.hero.title')}{' '}
            <span className="text-lc-green lc-glow-text">{t('marketing.hero.titleHighlight')}</span>
          </Heading>
          <Text as="p" size="base" tone="default" className="md:text-xl max-w-2xl leading-relaxed">
            {t('marketing.hero.subtitle')}
          </Text>
          <Text as="p" variant="muted" className="mt-3 md:text-base max-w-2xl leading-relaxed">
            {t('marketing.hero.trustLine')}
          </Text>
          <Stack gap="3" className="mt-7 sm:flex-row">
            <Button variant="pill" size="lg" onClick={() => onLaunch()}>
              <LogInIcon size={18} strokeWidth={2.5} />
              {t('marketing.hero.launchApp')}
            </Button>
            <a
              href="https://github.com/obelisk-app/obelisk"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ variant: 'pillSecondary', size: 'lg' })}
            >
              <GitHubMark width="18" height="18" />
              {t('marketing.hero.github')}
            </a>
          </Stack>
        </div>

        <div className="w-full lg:col-span-2">
          <HeroProductPreview
            desktopAlt={t('marketing.landing.preview.desktop.alt')}
            mobileAlt={t('marketing.landing.preview.mobile.alt')}
          />
        </div>
      </Container>
    </section>
  );
}
