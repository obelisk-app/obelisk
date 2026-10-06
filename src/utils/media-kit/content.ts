/**
 * The media kit's data: brand colours, copy, links, downloadable assets and
 * the embed snippets. Kept out of the components so the page reads as layout.
 *
 * The page's own labels are `mediaKit.*` keys. What stays as literal text
 * here is the brand material itself: `COPY` (the pitches and taglines, offered
 * in English and Spanish and labelled by language), the embed snippets and
 * the banner lettering, which a journalist copies or downloads as they are.
 */

import type { MessageKey } from '@/i18n/keys';

type Color = { nameKey: MessageKey; token: string; hex: string; usageKey: MessageKey };

export const COLORS: Color[] = [
  { nameKey: 'mediaKit.color.black.name', token: 'lc-black', hex: '#0a0a0a', usageKey: 'mediaKit.color.black.usage' },
  { nameKey: 'mediaKit.color.dark.name', token: 'lc-dark', hex: '#171717', usageKey: 'mediaKit.color.dark.usage' },
  { nameKey: 'mediaKit.color.border.name', token: 'lc-border', hex: '#262626', usageKey: 'mediaKit.color.border.usage' },
  { nameKey: 'mediaKit.color.muted.name', token: 'lc-muted', hex: '#a3a3a3', usageKey: 'mediaKit.color.muted.usage' },
  { nameKey: 'mediaKit.color.white.name', token: 'lc-white', hex: '#fafafa', usageKey: 'mediaKit.color.white.usage' },
  { nameKey: 'mediaKit.color.green.name', token: 'lc-green', hex: '#b4f953', usageKey: 'mediaKit.color.green.usage' },
];

/** Brand copy, offered as is: each language's version is its own deliverable. */
export const COPY = {
  name: 'Obelisk',
  tagline: 'Group chat powered by Nostr identity',
  taglineEs: 'Chat grupal con identidad Nostr',
  shortPitch:
    'Obelisk is a Discord-style group chat where identity comes from your Nostr keypair. No emails, no passwords: cryptographic identity only.',
  shortPitchEs:
    'Obelisk es un chat grupal estilo Discord donde la identidad viene de tu llave Nostr. Sin emails, sin contraseñas: solo identidad criptográfica.',
  oneLiner: 'No emails. No passwords. Cryptographic identity.',
  oneLinerEs: 'Sin emails. Sin contraseñas. Identidad criptográfica.',
  longPitch:
    'Obelisk is a fully relay-only group chat application built on Nostr. It implements NIP-29 for groups, NIP-04/NIP-17 for direct messages, P2P and SFU voice via WebRTC signaled over Nostr, and Lightning payments via NIP-47 (Nostr Wallet Connect). No backend, no database: the client talks directly to relays.',
  longPitchEs:
    'Obelisk es una aplicación de chat grupal completamente sobre relays Nostr. Implementa NIP-29 para grupos, NIP-04/NIP-17 para mensajes directos, voz P2P y SFU vía WebRTC señalizado por Nostr, y pagos Lightning vía NIP-47 (Nostr Wallet Connect). Sin backend, sin base de datos: el cliente habla directamente con los relays.',
};

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

export const EMBED_HTML_BANNER = `<a href="https://obelisk.ar" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none;font-family:Inter,system-ui,sans-serif;background:#0a0a0a;border:1px solid #262626;border-radius:12px;padding:14px 20px;color:#fafafa;">
  <span style="display:flex;align-items:center;gap:12px;">
    <span style="display:inline-block;width:10px;height:10px;border-radius:9999px;background:#b4f953;box-shadow:0 0 12px #b4f953;"></span>
    <span style="font-weight:700;letter-spacing:-0.01em;">Obelisk</span>
    <span style="color:#a3a3a3;">- Group chat powered by Nostr identity</span>
  </span>
</a>`;

export const EMBED_BADGE = `<a href="https://obelisk.ar" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:#b4f953;color:#0a0a0a;font-family:Inter,system-ui,sans-serif;font-weight:700;font-size:13px;border-radius:9999px;text-decoration:none;">
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2 L8 8 L7 22 H17 L16 8 Z"/></svg>
  Powered by Obelisk
</a>`;

export const EMBED_OG = `<!-- Add to <head> for sharing previews -->
<meta property="og:title" content="Obelisk - Group chat powered by Nostr identity" />
<meta property="og:description" content="No emails. No passwords. Cryptographic identity." />
<meta property="og:image" content="https://obelisk.ar/og/obelisk.png" />
<meta property="og:url" content="https://obelisk.ar" />
<meta name="twitter:card" content="summary_large_image" />`;

export const GRID_OVERLAY: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(rgba(180,249,83,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(180,249,83,0.04) 1px, transparent 1px)',
  backgroundSize: '40px 40px',
};

export const GLOW_GRADIENT =
  'radial-gradient(circle, rgba(180,249,83,0.35) 0%, rgba(180,249,83,0.1) 40%, transparent 70%)';

/**
 * The about section's four pitches. `lang` is the pitch's own language, shown
 * as a code in its label (`mediaKit.pitch.short`), not the page's.
 */
export const PITCHES: ReadonlyArray<{ lang: string; labelKey: MessageKey; text: string }> = [
  { lang: 'EN', labelKey: 'mediaKit.pitch.short', text: COPY.shortPitch },
  { lang: 'ES', labelKey: 'mediaKit.pitch.short', text: COPY.shortPitchEs },
  { lang: 'EN', labelKey: 'mediaKit.pitch.long', text: COPY.longPitch },
  { lang: 'ES', labelKey: 'mediaKit.pitch.long', text: COPY.longPitchEs },
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

/** Quick-use phrases, each with its copy button; `lang` fills the label's `{lang}`. */
export const SHORT_COPY: ReadonlyArray<{ labelKey: MessageKey; lang?: string; value: string }> = [
  { labelKey: 'mediaKit.shortCopyLabel.name', value: COPY.name },
  { labelKey: 'mediaKit.shortCopyLabel.tagline', lang: 'EN', value: COPY.tagline },
  { labelKey: 'mediaKit.shortCopyLabel.tagline', lang: 'ES', value: COPY.taglineEs },
  { labelKey: 'mediaKit.shortCopyLabel.oneLiner', lang: 'EN', value: COPY.oneLiner },
  { labelKey: 'mediaKit.shortCopyLabel.oneLiner', lang: 'ES', value: COPY.oneLinerEs },
  { labelKey: 'mediaKit.shortCopyLabel.url', value: LINKS.site },
  { labelKey: 'mediaKit.defaultRelay', value: LINKS.defaultRelay },
  { labelKey: 'mediaKit.shortCopyLabel.github', value: LINKS.github },
];

/** The print / merch banner's lettering: the wordmark itself, set in capitals. */
export const MONO_BANNER = { wordmark: 'OBELISK', tagline: 'Nostr-native group chat' };
