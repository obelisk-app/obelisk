/**
 * The media kit's data: brand colours, links, downloadable assets and the
 * embed snippets. Kept out of the components so the page reads as layout.
 *
 * Every word on the page, the brand copy included, comes from `mediaKit.*`
 * in the visitor's language: the pitches, taglines and one-liners are
 * `mediaKit.brand.*`, and the embed snippets are built from them here. What
 * stays literal is the name itself, the links and the markup around the copy.
 */

import type { MessageKey } from '@/i18n/keys';
import { EMBED_BADGE_MARK_SVG } from '@/assets/brand/embed-badge-mark';

type Color = { nameKey: MessageKey; token: string; hex: string; usageKey: MessageKey };

export const COLORS: Color[] = [
  { nameKey: 'mediaKit.color.black.name', token: 'lc-black', hex: '#0a0a0a', usageKey: 'mediaKit.color.black.usage' },
  { nameKey: 'mediaKit.color.dark.name', token: 'lc-dark', hex: '#171717', usageKey: 'mediaKit.color.dark.usage' },
  { nameKey: 'mediaKit.color.border.name', token: 'lc-border', hex: '#262626', usageKey: 'mediaKit.color.border.usage' },
  { nameKey: 'mediaKit.color.muted.name', token: 'lc-muted', hex: '#a3a3a3', usageKey: 'mediaKit.color.muted.usage' },
  { nameKey: 'mediaKit.color.white.name', token: 'lc-white', hex: '#fafafa', usageKey: 'mediaKit.color.white.usage' },
  { nameKey: 'mediaKit.color.green.name', token: 'lc-green', hex: '#b4f953', usageKey: 'mediaKit.color.green.usage' },
];

/** The product's name, the same in every language. */
export const BRAND_NAME = 'Obelisk'; // i18n-exempt: the product's name

export const LINKS = {
  site: 'https://obelisk.ar',
  github: 'https://github.com/obelisk-app/obelisk',
  defaultRelay: 'wss://public.obelisk.ar',
};

// `/obelisk.png` used to lead this list. It is the pre-hollow-face artwork
// (both faces solid, ~8% wider at the base) and no longer matches the icon we
// ship, so it is not offered for download. The file stays in /public so old
// external links keep resolving.
type Asset = { src: string; labelKey: MessageKey; bg: string; download: string };

export const ASSETS: ReadonlyArray<Asset> = [
  {
    src: '/icon-512.png',
    labelKey: 'mediaKit.asset.logo',
    bg: 'bg-lc-black',
    download: 'obelisk-logo.png',
  },
  {
    src: '/obelisk-favicon.png',
    labelKey: 'mediaKit.asset.favicon',
    bg: 'bg-lc-black',
    download: 'obelisk-favicon.png',
  },
  {
    src: '/icon-192.png',
    labelKey: 'mediaKit.asset.appIcon',
    bg: 'bg-lc-black',
    download: 'icon-192.png',
  },
  {
    src: '/obelisk.gif',
    labelKey: 'mediaKit.asset.animated',
    bg: 'bg-lc-black',
    download: 'obelisk.gif',
  },
  {
    src: '/obelisk-lg.gif',
    labelKey: 'mediaKit.asset.animatedLarge',
    bg: 'bg-lc-black',
    download: 'obelisk-lg.gif',
  },
  {
    src: '/obelisk-md.gif',
    labelKey: 'mediaKit.asset.animatedMedium',
    bg: 'bg-lc-black',
    download: 'obelisk-md.gif',
  },
  {
    src: '/obelisk-sm.gif',
    labelKey: 'mediaKit.asset.animatedSmall',
    bg: 'bg-lc-black',
    download: 'obelisk-sm.gif',
  },
  {
    src: '/lacrypta-logo.png',
    labelKey: 'mediaKit.asset.laCryptaLogo',
    bg: 'bg-lc-black',
    download: 'lacrypta-logo.png',
  },
  {
    src: '/lacrypta-banner.png',
    labelKey: 'mediaKit.asset.laCryptaBanner',
    bg: 'bg-lc-black',
    download: 'lacrypta-banner.png',
  },
  {
    src: '/nostr-wot-logo.png',
    labelKey: 'mediaKit.asset.wotLogoPng',
    bg: 'bg-lc-black',
    download: 'nostr-wot-logo.png',
  },
  {
    src: '/nostr-wot-logo.svg',
    labelKey: 'mediaKit.asset.wotLogoSvg',
    bg: 'bg-lc-black',
    download: 'nostr-wot-logo.svg',
  },
  {
    src: '/nostr-wot-logo-clean.png',
    labelKey: 'mediaKit.asset.wotLogoClean',
    bg: 'bg-lc-black',
    download: 'nostr-wot-logo-clean.png',
  },
];

export const OG_IMAGE_URL = '/og/obelisk.png';

/** Escapes text for HTML element content and double-quoted attributes. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The banner pill snippet, lettered with the page language's tagline. */
export function embedHtmlBanner(tagline: string): string {
  return `<a href="https://obelisk.ar" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none;font-family:Inter,system-ui,sans-serif;background:#0a0a0a;border:1px solid #262626;border-radius:12px;padding:14px 20px;color:#fafafa;">
  <span style="display:flex;align-items:center;gap:12px;">
    <span style="display:inline-block;width:10px;height:10px;border-radius:9999px;background:#b4f953;box-shadow:0 0 12px #b4f953;"></span>
    <span style="font-weight:700;letter-spacing:-0.01em;">${BRAND_NAME}</span>
    <span style="color:#a3a3a3;">- ${escapeHtml(tagline)}</span>
  </span>
</a>`;
}

/** The "powered by" badge snippet; `label` is its text in the page language. */
export function embedBadge(label: string): string {
  return `<a href="https://obelisk.ar" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:#b4f953;color:#0a0a0a;font-family:Inter,system-ui,sans-serif;font-weight:700;font-size:13px;border-radius:9999px;text-decoration:none;">
  ${EMBED_BADGE_MARK_SVG}
  ${escapeHtml(label)}
</a>`;
}

/** The Open Graph meta tags, with the tagline and one-liner in the page language. */
export function embedOg({ comment, tagline, oneLiner }: { comment: string; tagline: string; oneLiner: string }): string {
  return `<!-- ${escapeHtml(comment)} -->
<meta property="og:title" content="${BRAND_NAME} - ${escapeHtml(tagline)}" />
<meta property="og:description" content="${escapeHtml(oneLiner)}" />
<meta property="og:image" content="https://obelisk.ar/og/obelisk.png" />
<meta property="og:url" content="https://obelisk.ar" />
<meta name="twitter:card" content="summary_large_image" />`;
}

export const GRID_OVERLAY: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(rgba(180,249,83,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(180,249,83,0.04) 1px, transparent 1px)',
  backgroundSize: '40px 40px',
};

export const GLOW_GRADIENT =
  'radial-gradient(circle, rgba(180,249,83,0.35) 0%, rgba(180,249,83,0.1) 40%, transparent 70%)';

/** The about section's two pitches, both in the page language. */
export const PITCHES: ReadonlyArray<{ labelKey: MessageKey; textKey: MessageKey }> = [
  { labelKey: 'mediaKit.pitch.short', textKey: 'mediaKit.brand.shortPitch' },
  { labelKey: 'mediaKit.pitch.long', textKey: 'mediaKit.brand.longPitch' },
];

/** The in-page table of contents under the hero. */
export const NAV_LINKS: ReadonlyArray<readonly [href: string, labelKey: MessageKey]> = [
  ['#about', 'mediaKit.nav.about'],
  ['#logos', 'mediaKit.nav.logos'],
  ['#banners', 'mediaKit.nav.banners'],
  ['#colors', 'mediaKit.nav.colors'],
  ['#typography', 'mediaKit.nav.typography'],
  ['#copy', 'mediaKit.nav.copy'],
  ['#embeds', 'mediaKit.nav.embeds'],
  ['#og', 'mediaKit.nav.og'],
  ['#contact', 'mediaKit.nav.contact'],
  ['#guidelines', 'mediaKit.nav.guidelines'],
];

/**
 * Quick-use phrases, each with its copy button. A phrase is either literal
 * (`value`: the name, the links) or copy in the page language (`valueKey`).
 */
export type ShortCopyItem = { labelKey: MessageKey } & ({ value: string } | { valueKey: MessageKey });

export const SHORT_COPY: ReadonlyArray<ShortCopyItem> = [
  { labelKey: 'mediaKit.shortCopyLabel.name', value: BRAND_NAME },
  { labelKey: 'mediaKit.shortCopyLabel.tagline', valueKey: 'mediaKit.brand.tagline' },
  { labelKey: 'mediaKit.shortCopyLabel.oneLiner', valueKey: 'mediaKit.brand.oneLiner' },
  { labelKey: 'mediaKit.shortCopyLabel.url', value: LINKS.site },
  { labelKey: 'mediaKit.defaultRelay', value: LINKS.defaultRelay },
  { labelKey: 'mediaKit.shortCopyLabel.github', value: LINKS.github },
];

/** The print / merch banner's wordmark, set in capitals; its tagline is `mediaKit.brand.monoTagline`. */
export const MONO_WORDMARK = 'OBELISK'; // i18n-exempt: the product's name, set in capitals
