'use client';

import { useTranslation } from '@/i18n/context';
import { COPY, LINKS, MONO_BANNER, OG_IMAGE_URL } from './content';
import { Section } from './kit-ui';
import { BannerCard } from './BannerCard';
import { GitHubSocialBanner, HeroBanner, LinkedInBanner, SquareBanner, XHeaderBanner } from './banners';

/** Every banner, each rendered live with its export size and a PNG download. */
export function BannersSection() {
  const { t } = useTranslation();
  return (
    <Section
      id="banners"
      title={t('mediaKit.banners')}
      description="Banners rendered in HTML/CSS: copy the snippets, screenshot them, or use the linked PNGs."
    >
      <div className="space-y-6">
        <BannerCard
          title={t('mediaKit.hero')}
          spec="1200 × 630 - share preview"
          filename="obelisk-hero-1200x630.png"
          pixelWidth={1200}
          extra={
            <a
              href={OG_IMAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="lc-pill-secondary px-3 py-1"
            >
              {t('mediaKit.openOgPng')}
            </a>
          }
        >
          <HeroBanner />
        </BannerCard>

        <BannerCard
          title={t('mediaKit.xHeader')}
          spec="1500 × 500 - profile cover (3:1)"
          filename="obelisk-x-header-1500x500.png"
          pixelWidth={1500}
        >
          <XHeaderBanner />
        </BannerCard>

        <BannerCard
          title={t('mediaKit.linkedin')}
          spec="1584 × 396 - profile background (4:1)"
          filename="obelisk-linkedin-1584x396.png"
          pixelWidth={1584}
        >
          <LinkedInBanner />
        </BannerCard>

        <BannerCard
          title={t('mediaKit.github')}
          spec="1280 × 640 - repository preview"
          filename="obelisk-github-1280x640.png"
          pixelWidth={1280}
        >
          <GitHubSocialBanner />
        </BannerCard>

        <BannerCard
          title={t('mediaKit.square')}
          spec="1080 × 1080 - post or avatar"
          filename="obelisk-square-1080x1080.png"
          pixelWidth={1080}
        >
          <SquareBanner />
        </BannerCard>

        {/* Wide pill: footer / sponsor row */}
        <BannerCard
          title={t('mediaKit.widePill')}
          spec="footer / sponsor row"
          filename="obelisk-wide-pill.png"
          pixelWidth={1600}
        >
          <div className="flex items-center gap-4 p-6 sm:p-8 bg-lc-black">
            <div className="shrink-0 w-12 h-12 rounded-full bg-lc-green flex items-center justify-center text-lc-black font-extrabold">
              ◊
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-lc-white font-bold text-lg">
                {COPY.name}
              </div>
              <div className="text-lc-muted text-sm truncate">
                {COPY.tagline}
              </div>
            </div>
            <a
              href={LINKS.site}
              className="lc-pill-primary px-4 py-2 text-sm hidden sm:inline-block"
            >
              {t('mediaKit.openApp')}
            </a>
          </div>
        </BannerCard>

        {/* Minimal mono: for print / merch */}
        <BannerCard
          title={t('mediaKit.mono')}
          spec="for print / merch"
          filename="obelisk-minimal-mono.png"
          pixelWidth={1600}
        >
          <div className="p-10 sm:p-14 bg-lc-white text-lc-black text-center">
            <div className="text-3xl sm:text-5xl font-extrabold tracking-tight">
              {MONO_BANNER.wordmark}
            </div>
            <div className="mt-2 text-xs sm:text-sm uppercase tracking-[0.4em] text-neutral-600">
              {MONO_BANNER.tagline}
            </div>
          </div>
        </BannerCard>
      </div>
    </Section>
  );
}
