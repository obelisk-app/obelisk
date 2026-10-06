/**
 * The media kit's data: brand colours, copy, links, downloadable assets and
 * the embed snippets. Kept out of the components so the page reads as layout.
 */

type Color = { name: string; token: string; hex: string; usage: string };

export const COLORS: Color[] = [
  { name: 'Black', token: 'lc-black', hex: '#0a0a0a', usage: 'Background' },
  { name: 'Dark', token: 'lc-dark', hex: '#171717', usage: 'Cards' },
  { name: 'Border', token: 'lc-border', hex: '#262626', usage: 'Dividers' },
  { name: 'Muted', token: 'lc-muted', hex: '#a3a3a3', usage: 'Secondary text' },
  { name: 'White', token: 'lc-white', hex: '#fafafa', usage: 'Primary text' },
  { name: 'Green', token: 'lc-green', hex: '#b4f953', usage: 'Accent / CTA' },
];

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
export const ASSETS = [
  {
    src: '/icon-512.png',
    label: 'Obelisk Logo (PNG)',
    bg: 'bg-lc-black',
    download: 'obelisk-logo.png',
  },
  {
    src: '/obelisk-favicon.png',
    label: 'Favicon (PNG)',
    bg: 'bg-lc-black',
    download: 'obelisk-favicon.png',
  },
  {
    src: '/icon-192.png',
    label: 'App Icon - 192px (PNG)',
    bg: 'bg-lc-black',
    download: 'icon-192.png',
  },
  {
    src: '/obelisk.gif',
    label: 'Animated Obelisk (GIF)',
    bg: 'bg-lc-black',
    download: 'obelisk.gif',
  },
  {
    src: '/obelisk-lg.gif',
    label: 'Animated Obelisk - Large',
    bg: 'bg-lc-black',
    download: 'obelisk-lg.gif',
  },
  {
    src: '/obelisk-md.gif',
    label: 'Animated Obelisk - Medium',
    bg: 'bg-lc-black',
    download: 'obelisk-md.gif',
  },
  {
    src: '/obelisk-sm.gif',
    label: 'Animated Obelisk - Small',
    bg: 'bg-lc-black',
    download: 'obelisk-sm.gif',
  },
  {
    src: '/lacrypta-logo.png',
    label: 'La Crypta Logo (PNG)',
    bg: 'bg-lc-black',
    download: 'lacrypta-logo.png',
  },
  {
    src: '/lacrypta-banner.png',
    label: 'La Crypta Banner (PNG)',
    bg: 'bg-lc-black',
    download: 'lacrypta-banner.png',
  },
  {
    src: '/nostr-wot-logo.png',
    label: 'Nostr WoT Logo (PNG)',
    bg: 'bg-lc-black',
    download: 'nostr-wot-logo.png',
  },
  {
    src: '/nostr-wot-logo.svg',
    label: 'Nostr WoT Logo (SVG)',
    bg: 'bg-lc-black',
    download: 'nostr-wot-logo.svg',
  },
  {
    src: '/nostr-wot-logo-clean.png',
    label: 'Nostr WoT Logo - Clean (PNG)',
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

/** The about section's four pitches, each with its language label. */
export const PITCHES: ReadonlyArray<readonly [label: string, text: string]> = [
  ['EN - Short pitch', COPY.shortPitch],
  ['ES - Pitch corto', COPY.shortPitchEs],
  ['EN - Long pitch', COPY.longPitch],
  ['ES - Pitch largo', COPY.longPitchEs],
];

/** The in-page table of contents under the hero. */
export const NAV_LINKS: ReadonlyArray<readonly [href: string, label: string]> = [
  ['#about', 'About Obelisk'],
  ['#logos', 'Logos & icons'],
  ['#banners', 'Banners'],
  ['#colors', 'Colors'],
  ['#typography', 'Typography'],
  ['#copy', 'Copy'],
  ['#embeds', 'HTML embeds'],
  ['#og', 'Open Graph'],
  ['#contact', 'Contact'],
  ['#guidelines', 'Guidelines'],
];

/** Quick-use phrases, each with its copy button. */
export const SHORT_COPY: ReadonlyArray<readonly [label: string, value: string]> = [
  ['Name', COPY.name],
  ['Tagline (EN)', COPY.tagline],
  ['Tagline (ES)', COPY.taglineEs],
  ['One-liner (EN)', COPY.oneLiner],
  ['One-liner (ES)', COPY.oneLinerEs],
  ['URL', LINKS.site],
  ['Default relay', LINKS.defaultRelay],
  ['GitHub', LINKS.github],
];

/** The print / merch banner's lettering: the wordmark itself, set in capitals. */
export const MONO_BANNER = { wordmark: 'OBELISK', tagline: 'Nostr-native group chat' };
