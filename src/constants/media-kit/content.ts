/**
 * Media kit: content. Values the code in `utils/media-kit/content.ts` reads,
 * kept here so every reader imports the one copy.
 */

import type { MessageKey } from '@/i18n/keys';
import type { Color, Asset, ShortCopyItem } from '@/utils/media-kit/content';

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
