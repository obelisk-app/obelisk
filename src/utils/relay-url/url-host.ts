/**
 * The host of a relay (or any) URL, for labels: `wss://relay.example.com/`
 * reads as `relay.example.com`.
 *
 * This used to be defined seven times across the shells, the rail and the
 * social widgets, six of them byte for byte the same. One copy here so the
 * fallback (return the input untouched when it does not parse) is decided
 * once.
 */
export function shortHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
