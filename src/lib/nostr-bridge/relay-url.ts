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
