/**
 * Shared types and pure helpers for link unfurling.
 *
 * Separate from the route because a Next route file may only export its HTTP
 * handlers -- and because the interesting logic here (which addresses are
 * refused, how a meta tag is read) is worth testing on its own.
 */

export interface LinkPreview {
  url: string;
  kind: 'link' | 'post';
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  author?: string;
}

/**
 * Reject anything that resolves to an address we should not be reaching.
 *
 * Checked against resolved IPs rather than hostnames, because a hostname is
 * attacker-controlled: `evil.com` with an A record of 169.254.169.254 is the
 * entire attack. Every redirect hop is re-checked for the same reason.
 */
export function isBlockedAddress(ip: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  const v6 = ip.toLowerCase().split('%')[0];
  if (v6 === '::' || v6 === '::1') return true;
  if (v6.startsWith('fe80') || v6.startsWith('fc') || v6.startsWith('fd')) return true;
  if (v6.startsWith('::ffff:')) return isBlockedAddress(v6.slice(7)); // v4-mapped
  return false;
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    // Last, so a literal "&amp;mdash;" does not become an em dash.
    .replace(/&amp;/g, '&');
}

/** Pull one meta value, accepting property= or name= in either attribute order. */
export function readMeta(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*?content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*?(?:property|name)=["']${escaped}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1]).trim() || undefined;
  }
  return undefined;
}

export function isX(hostname: string): boolean {
  const host = hostname.replace(/^www\./, '').toLowerCase();
  return host === 'x.com' || host === 'twitter.com' || host === 'mobile.twitter.com';
}

export function tweetIdFrom(url: URL): string | null {
  const match = url.pathname.match(/\/status(?:es)?\/(\d{1,25})/);
  return match?.[1] ?? null;
}

/** The token X's own embed widget derives from the post id. No secret involved. */
export function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}
