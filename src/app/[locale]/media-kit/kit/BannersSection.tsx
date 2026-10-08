import { useTranslations } from 'next-intl';
import { BRAND_NAME, LINKS, MONO_WORDMARK, OG_IMAGE_URL } from '@/constants/media-kit/content';
import Section from '@/components/ui/layout/Section';
import { BannerCard } from './BannerCard';
import { GitHubSocialBanner, HeroBanner, LinkedInBanner, SquareBanner, XHeaderBanner } from './banners';

/** Every banner, each rendered live with its export size and a PNG download. */
export function BannersSection() {
  const t = useTranslations();
  return (
    <Section
      id="banners"
      title={t('mediaKit.banners')}
      description={t('mediaKit.desc.banners')}
    >
      <div className="space-y-6">
        <BannerCard
          title={t('mediaKit.hero')}
          spec={t('mediaKit.spec.hero')}
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
          spec={t('mediaKit.spec.xHeader')}
          filename="obelisk-x-header-1500x500.png"
          pixelWidth={1500}
        >
          <XHeaderBanner />
        </BannerCard>

        <BannerCard
          title={t('mediaKit.linkedin')}
          spec={t('mediaKit.spec.linkedin')}
          filename="obelisk-linkedin-1584x396.png"
          pixelWidth={1584}
        >
          <LinkedInBanner />
        </BannerCard>

        <BannerCard
          title={t('mediaKit.github')}
          spec={t('mediaKit.spec.github')}
          filename="obelisk-github-1280x640.png"
          pixelWidth={1280}
        >
          <GitHubSocialBanner />
        </BannerCard>

        <BannerCard
          title={t('mediaKit.square')}
          spec={t('mediaKit.spec.square')}
          filename="obelisk-square-1080x1080.png"
          pixelWidth={1080}
        >
          <SquareBanner />
        </BannerCard>

        {/* Wide pill: footer / sponsor row */}
        <BannerCard
          title={t('mediaKit.widePill')}
          spec={t('mediaKit.spec.widePill')}
          filename="obelisk-wide-pill.png"
          pixelWidth={1600}
        >
          <div className="flex items-center gap-4 p-6 sm:p-8 bg-lc-black">
            <div className="shrink-0 w-12 h-12 rounded-full bg-lc-green flex items-center justify-center text-lc-black font-extrabold">
              ◊
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-lc-white font-bold text-lg">
                {BRAND_NAME}
              </div>
              <div className="text-lc-muted text-sm truncate">
                {t('mediaKit.brand.tagline')}
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
          spec={t('mediaKit.spec.mono')}
          filename="obelisk-minimal-mono.png"
          pixelWidth={1600}
        >
          <div className="p-10 sm:p-14 bg-lc-white text-lc-black text-center">
            <div className="text-3xl sm:text-5xl font-extrabold tracking-tight">
              {MONO_WORDMARK}
            </div>
            <div className="mt-2 text-xs sm:text-sm uppercase tracking-[0.4em] text-neutral-600">
              {t('mediaKit.brand.monoTagline')}
            </div>
          </div>
        </BannerCard>
      </div>
    </Section>
  );
}
