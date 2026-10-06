'use client';

import { useTranslations } from 'next-intl';
import { COLORS, embedBadge, embedHtmlBanner, embedOg, OG_IMAGE_URL, SHORT_COPY } from '@/utils/media-kit/content';
import { CodeBlock, CopyButton, Section } from './kit-ui';
import { EmbedPreview } from './BannerCard';

/** The palette tokens, each with its HEX to copy. */
export function PaletteSection() {
  const t = useTranslations();
  return (
    <Section
      id="colors"
      title={t('mediaKit.palette')}
      description={t('mediaKit.desc.palette')}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {COLORS.map((c) => (
          <div key={c.token} className="lc-card overflow-hidden">
            <div
              className="h-24 border-b border-lc-border"
              style={{ backgroundColor: c.hex }}
            />
            <div className="p-4 flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{t(c.nameKey)}</div>
                <div className="text-xs text-lc-muted">
                  {c.token} · {t(c.usageKey)}
                </div>
              </div>
              <CopyButton text={c.hex} />
            </div>
            <div className="px-4 pb-4 -mt-2 text-xs text-lc-muted font-mono">
              {c.hex}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/** Quick-use phrases. */
export function ShortCopySection() {
  const t = useTranslations();
  return (
    <Section
      id="copy"
      title={t('mediaKit.shortCopy')}
      description={t('mediaKit.desc.shortCopy')}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {SHORT_COPY.map((item) => {
          const value = 'valueKey' in item ? t(item.valueKey) : item.value;
          return (
            <div
              key={item.labelKey}
              className="lc-card p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-widest text-lc-green">
                  {t(item.labelKey)}
                </div>
                <div className="text-sm truncate">{value}</div>
              </div>
              <CopyButton text={value} />
            </div>
          );
        })}
      </div>
    </Section>
  );
}

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
