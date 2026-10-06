/**
 * Normalize a relay URL for equality comparison. Parse via `URL` when the
 * input is parseable so host/scheme casing and trailing slashes are folded
 * by URL semantics (catches `wss://Relay.com/`, `wss://relay.com`, etc.);
 * fall back to trim+lowercase otherwise.
 *
 * This is the one relay-equality key for the whole app: cache prefixes
 * (`cache.ts`), the `relayAccess` map, the rail's active check, the
 * background watch and the stores all key on it. The contract, pinned by
 * `relay-url.test.ts`: trim; fold host case, keep path case; drop the
 * default port; strip every trailing slash (a bare root has no slash);
 * drop the fragment; keep the query as given; `ws://` and `wss://` stay
 * distinct. Do not write another copy; `PhoneShell.tsx` and
 * `social/relays.ts` still carry ones with different answers and are
 * being pointed here.
 *
 * nostr-tools' `normalizeURL` (what the RelayHub keys sockets on) agrees
 * for every configured-relay shape once its output is passed through here,
 * but keeps a trailing slash on a bare root and sorts the query, so a hub
 * URL must be re-normalized before it is used as a bridge key.
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
 * human page: the operator's landing page, or at minimum the NIP-11
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
