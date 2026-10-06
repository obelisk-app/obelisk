'use client';

import { useTranslation } from '@/i18n/context';
import { COLORS, EMBED_BADGE, EMBED_HTML_BANNER, EMBED_OG, OG_IMAGE_URL, SHORT_COPY } from '@/utils/media-kit/content';
import { CodeBlock, CopyButton, Section } from './kit-ui';
import { EmbedPreview } from './BannerCard';

/** The palette tokens, each with its HEX to copy. */
export function PaletteSection() {
  const { t } = useTranslation();
  return (
    <Section
      id="colors"
      title={t('mediaKit.palette')}
      description="Design-system tokens. Tap the HEX to copy it."
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
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-lc-muted">
                  {c.token} · {c.usage}
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
  const { t } = useTranslation();
  return (
    <Section
      id="copy"
      title={t('mediaKit.shortCopy')}
      description="Quick-use phrases."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {SHORT_COPY.map(([label, value]) => (
          <div
            key={label}
            className="lc-card p-4 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-widest text-lc-green">
                {label}
              </div>
              <div className="text-sm truncate">{value}</div>
            </div>
            <CopyButton text={value} />
          </div>
        ))}
      </div>
    </Section>
  );
}

/** The HTML embed snippets and the Open Graph preview with its meta tags. */
export function EmbedSections() {
  const { t } = useTranslation();
  return (
    <>
      {/* Embeds */}
      <Section
        id="embeds"
        title={t('mediaKit.embeds')}
        description="Paste these snippets anywhere to link to Obelisk with style."
      >
        <div className="space-y-6">
          <EmbedPreview
            title={t('mediaKit.bannerPill')}
            html={EMBED_HTML_BANNER}
            filename="obelisk-banner-pill.png"
            pixelWidth={1200}
          />
          <EmbedPreview
            title='"Powered by Obelisk" badge'
            html={EMBED_BADGE}
            filename="obelisk-powered-by-badge.png"
            pixelWidth={600}
          />
        </div>
      </Section>

      {/* OG */}
      <Section
        id="og"
        title={t('mediaKit.openGraph')}
        description="Runtime-generated share preview and ready-to-paste meta tags."
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
            <span>1200 × 630 · /og/obelisk.png</span>
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
        <CodeBlock code={EMBED_OG} />
      </Section>
    </>
  );
}
