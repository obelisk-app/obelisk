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

/** The host a preview card labels itself with: `www.` dropped, the site name if the URL will not parse. */
export function previewHost(preview: LinkPreview): string {
  try {
    return new URL(preview.url).hostname.replace(/^www\./, '');
  } catch {
    return preview.siteName ?? '';
  }
}

/**
 * An address as 16-bit words: two for IPv4, eight for IPv6. One shape lets a
 * single prefix matcher serve both families, and lets the IPv4 ranges be
 * reused for the IPv4 bytes embedded in a mapped or NAT64 address.
 */
type Words = readonly number[];

interface BlockedRange {
  readonly words: Words;
  readonly bits: number;
}

function parseV4(ip: string): Words | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
}

/**
 * Expand an IPv6 literal to eight words. Accepts `::` compression, a trailing
 * dotted quad (`::ffff:127.0.0.1`) and a zone id, which is dropped. Returns
 * `null` for anything else, which the caller treats as blocked.
 */
function parseV6(raw: string): Words | null {
  const ip = raw.split('%')[0].toLowerCase();
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const expand = (segment: string): number[] | null => {
    if (segment === '') return [];
    const out: number[] = [];
    const groups = segment.split(':');
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (i === groups.length - 1 && g.includes('.')) {
        const v4 = parseV4(g);
        if (!v4) return null;
        out.push(...v4);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = expand(halves[0]);
  const tail = halves.length === 2 ? expand(halves[1]) : [];
  if (!head || !tail) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;
  return [...head, ...new Array<number>(missing).fill(0), ...tail];
}

function hasPrefix(words: Words, range: BlockedRange): boolean {
  let bits = range.bits;
  for (let i = 0; i < range.words.length && bits > 0; i++) {
    const take = Math.min(16, bits);
    const mask = (0xffff << (16 - take)) & 0xffff;
    if ((words[i] & mask) !== (range.words[i] & mask)) return false;
    bits -= take;
  }
  return true;
}

function v4Range(ip: string, bits: number): BlockedRange {
  const words = parseV4(ip);
  if (!words) throw new Error(`bad range ${ip}`);
  return { words, bits };
}

function v6Range(ip: string, bits: number): BlockedRange {
  const words = parseV6(ip);
  if (!words) throw new Error(`bad range ${ip}`);
  return { words, bits };
}

const BLOCKED_V4: readonly BlockedRange[] = [
  v4Range('0.0.0.0', 8), // "this" network
  v4Range('10.0.0.0', 8), // private
  v4Range('100.64.0.0', 10), // CGNAT
  v4Range('127.0.0.0', 8), // loopback
  v4Range('169.254.0.0', 16), // link-local, incl. cloud metadata
  v4Range('172.16.0.0', 12), // private
  v4Range('192.0.0.0', 24), // IETF protocol assignments
  v4Range('192.0.2.0', 24), // TEST-NET-1
  v4Range('192.168.0.0', 16), // private
  v4Range('198.18.0.0', 15), // benchmarking
  v4Range('198.51.100.0', 24), // TEST-NET-2
  v4Range('203.0.113.0', 24), // TEST-NET-3
  v4Range('224.0.0.0', 3), // multicast, reserved, broadcast
];

/** IPv6 ranges blocked outright. Ranges that embed an IPv4 address are below. */
const BLOCKED_V6: readonly BlockedRange[] = [
  v6Range('::', 96), // unspecified, loopback and the deprecated IPv4-compatible form
  v6Range('64:ff9b::', 96), // NAT64 well-known prefix: a tunnel to any IPv4 host
  v6Range('64:ff9b:1::', 48), // NAT64 local-use prefix
  v6Range('100::', 64), // discard-only
  v6Range('2001:db8::', 32), // documentation
  v6Range('2002::', 16), // 6to4: a tunnel to any IPv4 host
  v6Range('fc00::', 7), // unique local
  v6Range('fe80::', 10), // link-local
  v6Range('ff00::', 8), // multicast
];

const V4_MAPPED = v6Range('::ffff:0:0', 96);

/**
 * Reject anything that resolves to an address we should not be reaching.
 *
 * Checked against resolved IPs rather than hostnames, because a hostname is
 * attacker-controlled: `evil.com` with an A record of 169.254.169.254 is the
 * entire attack. Every redirect hop is re-checked for the same reason.
 *
 * Anything that does not parse as an address is blocked too: the callers only
 * pass resolver output, so an unparseable string means something upstream is
 * confused, and the safe answer to confusion here is no.
 */
export function isBlockedAddress(ip: string): boolean {
  const v4 = parseV4(ip);
  if (v4) return BLOCKED_V4.some((range) => hasPrefix(v4, range));
  const v6 = parseV6(ip);
  if (!v6) return true;
  // A v4-mapped address is judged by the IPv4 it carries, whether it was
  // written as `::ffff:127.0.0.1` or as `::ffff:7f00:1`.
  if (hasPrefix(v6, V4_MAPPED)) {
    const embedded = v6.slice(6);
    return BLOCKED_V4.some((range) => hasPrefix(embedded, range));
  }
  return BLOCKED_V6.some((range) => hasPrefix(v6, range));
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '\u2014')
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
