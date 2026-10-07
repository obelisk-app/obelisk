/**
 * Reading a `?relay=` deep link: one spelling per relay, and whether it is the
 * current relay, one of the person's own, or a new one.
 */
export type DeepLinkRelayClass = 'current' | 'known' | 'unknown';

/** `relay.example`, `wss://relay.example/` and `WSS://Relay.Example` are one relay. */
export function normalizeDeepLinkRelay(raw: string): string {
  const withScheme = /^wss?:\/\//i.test(raw) ? raw : `wss://${raw}`;
  return withScheme.replace(/\/+$/, '').toLowerCase();
}

export function sameRelay(a: string | null | undefined, b: string): boolean {
  return !!a && normalizeDeepLinkRelay(a) === b;
}

/**
 * What a deep link to `requested` may do, given what the user already has.
 * Pure, so the shells can also use it for the one synchronous decision they
 * need (which relay to stamp into the seeded history) without reaching for
 * the bridge.
 */
export function classifyDeepLinkRelay(
  requested: string,
  current: string | null | undefined,
  configured: ReadonlyArray<string>,
): DeepLinkRelayClass {
  const target = normalizeDeepLinkRelay(requested);
  if (sameRelay(current, target)) return 'current';
  if (configured.some((url) => sameRelay(url, target))) return 'known';
  return 'unknown';
}
