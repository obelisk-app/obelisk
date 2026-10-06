'use client';

import { useTranslation } from '@/i18n/context';
import Button, { buttonClass } from '@/components/ui/Button';
import LandingHeroAnimation from './LandingHeroAnimation';
import HeroProductPreview from './HeroProductPreview';

/**
 * The hero: headline, pitch, the launch and GitHub buttons, the animation and the screenshots.
 */
export default function LandingHero({ onLaunch }: { onLaunch: () => void }) {
  const { t } = useTranslation();
  return (
    <section
      data-testid="landing-hero"
      className="relative pt-20 pb-14 md:pt-24 md:pb-20 px-6 overflow-hidden"
    >
      <div className="absolute inset-0 bg-lc-black/35 pointer-events-none" aria-hidden="true" />
      <div className="absolute top-24 left-1/2 -translate-x-1/2 w-[520px] h-[520px] bg-lc-green/3 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-lc-black pointer-events-none" aria-hidden="true" />

      <div className="max-w-6xl mx-auto grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center relative z-10">
        <LandingHeroAnimation />

        <div className="flex min-w-0 flex-col items-center text-center lg:items-start lg:text-left">
          <h1 className="w-full max-w-[680px] text-4xl font-extrabold leading-[1.05] tracking-normal sm:text-5xl lg:text-6xl mb-4">
            {t('hero.title')}{' '}
            <span className="text-lc-green lc-glow-text">{t('hero.titleHighlight')}</span>
          </h1>
          <p className="text-base md:text-xl text-lc-white max-w-2xl leading-relaxed">
            {t('hero.subtitle')}
          </p>
          <p className="mt-3 text-sm md:text-base text-lc-muted max-w-2xl leading-relaxed">
            {t('hero.trustLine')}
          </p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3">
            <Button variant="pill" size="lg" onClick={() => onLaunch()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/>
                <line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
              {t('hero.launchApp')}
            </Button>
            <a
              href="https://github.com/obelisk-app/obelisk"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ variant: 'pillSecondary', size: 'lg' })}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              {t('hero.github')}
            </a>
          </div>
        </div>

        <div className="w-full lg:col-span-2">
          <HeroProductPreview
            desktopAlt={t('landing.preview.desktop.alt')}
            mobileAlt={t('landing.preview.mobile.alt')}
          />
        </div>
      </div>
    </section>
  );
}
