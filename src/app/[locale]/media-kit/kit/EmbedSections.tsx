'use client';

import { useTranslations } from 'next-intl';
import { embedBadge, embedHtmlBanner, embedOg, OG_IMAGE_URL } from '@/utils/media-kit/content';
import { CodeBlock } from './CodeBlock';
import { EmbedPreview } from './EmbedPreview';
import { Section } from './Section';

/** The HTML embed snippets and the Open Graph preview with its meta tags. */
export function EmbedSections() {
  const t = useTranslations();
  return (
    <>
      {/* Embeds */}
      <Section
        id="embeds"
        title={t('mediaKit.embeds')}
        description={t('mediaKit.desc.embeds')}
      >
        <div className="space-y-6">
          <EmbedPreview
            title={t('mediaKit.bannerPill')}
            html={embedHtmlBanner(t('mediaKit.brand.tagline'))}
            filename="obelisk-banner-pill.png"
            pixelWidth={1200}
          />
          <EmbedPreview
            title={t('mediaKit.poweredByBadge')}
            html={embedBadge(t('mediaKit.brand.poweredBy'))}
            filename="obelisk-powered-by-badge.png"
            pixelWidth={600}
          />
        </div>
      </Section>

      {/* OG */}
      <Section
        id="og"
        title={t('mediaKit.openGraph')}
        description={t('mediaKit.desc.og')}
      >
        <div className="lc-card overflow-hidden mb-4">
          <div className="aspect-[1200/630] relative bg-lc-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={OG_IMAGE_URL}
              alt={t('mediaKit.openGraphPreview')}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
          <div className="border-t border-lc-border p-3 flex items-center justify-between text-xs text-lc-muted">
            <span>1200 × 630 · /og/obelisk.png</span> {/* i18n-exempt: the image's size and path */}
            <a
              href={OG_IMAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="lc-pill-secondary px-3 py-1"
            >
              {t('mediaKit.openInNewTab')}
            </a>
          </div>
        </div>
        <CodeBlock
          code={embedOg({
            comment: t('mediaKit.brand.ogComment'),
            tagline: t('mediaKit.brand.tagline'),
            oneLiner: t('mediaKit.brand.oneLiner'),
          })}
        />
      </Section>
    </>
  );
}
