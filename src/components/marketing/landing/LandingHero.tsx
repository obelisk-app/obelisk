import Link from '@/components/ui/navigation/Link';
import Container from '@/components/ui/layout/Container';
import Stack from '@/components/ui/layout/Stack';
import { useTranslations } from 'next-intl';
import HeroProductPreview from './HeroProductPreview';
import { LogInIcon } from '@/assets/icons';
import GitHubMark from '@/assets/brand/GitHubMark';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/**
 * The hero, laid out like Obelisk Sky's: headline, pitch and the launch and
 * GitHub buttons on the left, the app looping on desktop and on a phone on
 * the right. The highlighted words shimmer in Sky's lime.
 */
export default function LandingHero() {
  const t = useTranslations();
  return (
    <section
      data-testid="landing-hero"
      className="relative pt-20 pb-14 md:pt-24 md:pb-20 px-6 overflow-hidden"
    >
      <div className="absolute inset-0 bg-lc-black/35 pointer-events-none" aria-hidden="true" />
      <div className="absolute top-24 left-1/2 -translate-x-1/2 w-[520px] h-[520px] bg-lc-green/3 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-lc-black pointer-events-none" aria-hidden="true" />

      <Container width="6xl" className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10 lg:items-center relative z-10">
        <div className="flex min-w-0 flex-col items-center text-center lg:items-start lg:text-left">
          <Heading as="h1" className="w-full max-w-[640px] text-4xl font-extrabold leading-[1.05] tracking-normal sm:text-5xl lg:text-6xl mb-4">
            {t('marketing.hero.title')}{' '}
            <span className="lc-shine-text">{t('marketing.hero.titleHighlight')}</span>
          </Heading>
          <Text as="p" size="base" tone="default" className="md:text-xl max-w-xl leading-relaxed">
            {t('marketing.hero.subtitle')}
          </Text>
          <Text as="p" variant="muted" className="mt-3 md:text-base max-w-xl leading-relaxed">
            {t('marketing.hero.trustLine')}
          </Text>
          <Stack gap="3" className="mt-7 sm:flex-row">
            <Link href="/app" prefetch={false} variant="button" buttonVariant="pill" size="lg">
              <LogInIcon size={18} strokeWidth={2.5} />
              {t('marketing.hero.launchApp')}
            </Link>
            <Link
              href="https://github.com/obelisk-app/obelisk"
              target="_blank"
              variant="button" buttonVariant="pillSecondary" size="lg"
            >
              <GitHubMark width="18" height="18" />
              {t('marketing.hero.github')}
            </Link>
          </Stack>
        </div>

        <HeroProductPreview
          desktopAlt={t('marketing.landing.preview.desktop.alt')}
          mobileAlt={t('marketing.landing.preview.mobile.alt')}
        />
      </Container>
    </section>
  );
}
