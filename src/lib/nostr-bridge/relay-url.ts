/**
 * Normalize a relay URL for equality comparison. Parse via `URL` when the
 * input is parseable so host/scheme casing and trailing slashes are folded
 * by URL semantics (catches `wss://Relay.com/`, `wss://relay.com`, etc.);
 * fall back to trim+lowercase otherwise.
 *
 * Consolidated here so cache pools, auth-state maps, relay equality checks,
 * and the rail's dedup behavior all agree on what counts as "the same relay."
 */
export function normalizeRelayUrl(u: string): string {
  const trimmed = u.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.host}${pathname}${parsed.search}`;
  } catch {
    return trimmed.replace(/\/+$/, '').toLowerCase();
  }
}

/**
 * The relay's website, for the name in the top bar.
 *
 * A relay is a `wss://` endpoint, but the host almost always also serves a
 * human page — the operator's landing page, or at minimum the NIP-11
 * document. The relay name sat in the header as inert text, so "which relay
 * am I on, and who runs it" had no answer inside the app.
 *
 * Scheme swap only: guessing paths (`/about`, `/terms`) would 404 on most
 * relays, and a link that usually 404s is worse than no link.
 */
export function relayWebsiteUrl(relayUrl: string): string | null {
  const trimmed = relayUrl?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'wss:' && url.protocol !== 'ws:') return null;
    url.protocol = url.protocol === 'ws:' ? 'http:' : 'https:';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}
