/**
 * The configured-relay list: the default relays, the retired-URL redirect,
 * and the validators a relay URL passes before it is connected to or kept
 * in the rail. Pure string and URL logic; `relay-url.ts` owns equality.
 */
import { CodedError } from '@/utils/errors/codes';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';

export const DEFAULT_RELAY = 'wss://public.obelisk.ar';
export const LACRYPTA_RELAY = 'wss://lacrypta-relay.obelisk.ar';
export const RETIRED_RELAY = 'wss://relay.obelisk.ar';
export const DEFAULT_RELAYS = [DEFAULT_RELAY, LACRYPTA_RELAY];

/**
 * Strict client-side filter for relay URLs imported from remote events
 * (NIP-65 kind 10002, NIP-17 kind 10050, etc.). The browser's CSP only
 * allows `wss:` in `connect-src`, and localhost/loopback URLs published
 * by some clients (Coracle / dev setups) trigger a noisy CSP violation
 * AND a `WebSocket connection failed` per page-load. Drop them at
 * ingestion so they never reach `new WebSocket()`.
 *
 * Rules:
 *   - Must parse as a URL.
 *   - Must use `wss:` scheme. Plain `ws:` is rejected: browsers refuse
 *     mixed-content WebSockets from an https origin anyway, and any
 *     `ws://` entry in a published relay list is almost certainly a
 *     leftover from a local-dev relay an upstream client forgot to
 *     scrub before broadcasting.
 *   - Hostname can't be `localhost`, `*.localhost`, `*.local`, or an
 *     IPv4 literal in the loopback / RFC-1918 / link-local ranges.
 */
export function isImportableRelayUrl(url: string): boolean {
  let p: URL;
  try { p = new URL(url); } catch { return false; }
  if (p.protocol !== 'wss:') return false;
  const host = p.hostname.toLowerCase();
  if (!host) return false;
  if (host.endsWith('.onion')) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  if (host === 'host.docker.internal') return false;
  // IPv4 ranges that have no business in a relay list.
  if (/^127\./.test(host)) return false;
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return false;
  if (host === '0.0.0.0') return false;
  // IPv6 loopback / link-local literals.
  if (host === '::1' || host === '[::1]') return false;
  if (host.startsWith('fe80:')) return false;
  return true;
}

/**
 * Reject obviously-bogus relay URLs *before* opening a WebSocket. Browsers
 * will happily DNS-search single-label hosts (e.g. `pindonga` →
 * `pindonga.<search-domain>`) and corporate networks may serve a captive
 * page on TCP connect, so the WebSocket can occasionally appear to "open"
 * for typos. Require: ws/wss scheme + a hostname containing at least one
 * dot (or a literal IP / localhost).
 */
export function validateRelayUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new CodedError('invalid-relay-url', `"${url}" is not a valid URL`);
  }
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new CodedError('invalid-relay-url', `relay URL must use ws:// or wss:// (got ${parsed.protocol})`);
  }
  const host = parsed.hostname;
  if (!host) throw new CodedError('invalid-relay-url', 'relay URL has no hostname');
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':'); // v4 or v6
  const isLocalhost = host === 'localhost';
  if (!isIp && !isLocalhost && !host.includes('.')) {
    throw new CodedError('invalid-relay-url', `"${host}" is not a valid relay hostname (single-label hosts are not allowed)`);
  }
}

export function uniqueRelayUrls(urls: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    try {
      const normalized = normalizeConfiguredRelayUrl(raw);
      validateRelayUrl(normalized);
      if (!isImportableRelayUrl(normalized)) continue;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    } catch {
      // Ignore corrupted persisted relay entries; users can re-add them.
    }
  }
  return out;
}

export function normalizeConfiguredRelayUrl(url: string): string {
  const normalized = normalizeRelayUrl(url);
  return normalized === RETIRED_RELAY ? LACRYPTA_RELAY : normalized;
}
