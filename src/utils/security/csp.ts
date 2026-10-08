/**
 * The one Content-Security-Policy, built for static hashes, dynamic nonces, and the fallback floor.
 *
 * `src/proxy.ts` authorizes build-time scripts by hash on immutable public
 * pages and mints a nonce for dynamic documents. `next.config.ts` sends a static floor on
 * every response through `headers()`, for the requests the proxy never
 * sees: a matcher gap, or a framework bug of the "Middleware / Proxy
 * bypass" class that next@16.2.x shipped several of. Both come from here so
 * the directive lists cannot drift apart.
 *
 * Why the floor must be a superset of the nonce policy, not just "a CSP":
 * when two Content-Security-Policy headers reach a browser it enforces
 * both, so the effective policy is their intersection. A floor that said
 * `script-src 'self'` would veto every nonce'd inline script the proxy
 * policy allows (Next's own `__next_f` bootstrap included) and take the
 * page down. A floor that omitted script-src would be no better: script-src
 * falls back to default-src, and `default-src 'self'` vetoes inline scripts
 * just the same. So the floor keeps every directive byte-identical and
 * swaps the single token it cannot know, the nonce, for `'unsafe-inline'`.
 * With the proxy present the nonce policy still governs inline scripts and
 * the floor adds no permission the proxy does not grant; alone, the floor
 * still pins script and frame hosts, blocks plugins, framing, base-uri and
 * form-action, and upgrades insecure requests. `tests/utils/security/csp.test.ts` pins
 * the superset property.
 *
 * In `next start` the two headers do not both reach the browser: Next's
 * router applies `headers()` first and then overwrites the same header
 * with the proxy's, so a proxied route carries only the nonce policy and
 * an unproxied one only the floor. The superset design is kept anyway so
 * the result stays correct if a CDN, or a future Next, appends instead.
 */

/**
 * Embeddable players the message renderer may frame (YouTube, Vimeo,
 * Twitch, SoundCloud, Spotify, Twitter/X, TikTok, Instagram, Reddit,
 * Bandcamp, Mixcloud, Loom, CodePen, CodeSandbox, GitHub Gist, Google
 * Maps/Docs).
 */
const CSP_FRAME_SRC: readonly string[] = [
  "'self'",
  'https://www.youtube.com',
  'https://www.youtube-nocookie.com',
  'https://player.vimeo.com',
  'https://player.twitch.tv',
  'https://clips.twitch.tv',
  'https://embed.twitch.tv',
  'https://w.soundcloud.com',
  'https://open.spotify.com',
  'https://platform.twitter.com',
  'https://platform.x.com',
  'https://www.tiktok.com',
  'https://www.instagram.com',
  'https://www.redditmedia.com',
  'https://embed.reddit.com',
  'https://bandcamp.com',
  'https://*.bandcamp.com',
  'https://www.mixcloud.com',
  'https://www.loom.com',
  'https://codepen.io',
  'https://codesandbox.io',
  'https://gist.github.com',
  'https://www.google.com',
  'https://docs.google.com',
];

export type CspOptions = {
  /**
   * The per-request nonce, or `null` for hashes or the static floor. The floor
   * substitutes `'unsafe-inline'`, the only token that is a superset of
   * any nonce or hash; omitted hashes select the floor. See the module comment.
   */
  nonce: string | null;
  /**
   * `'unsafe-eval'` is dev-only: React's dev build uses eval() to
   * reconstruct call stacks across module boundaries (production never
   * does). Without it the React tree fails to hydrate over a tunneled
   * origin.
   */
  isDev: boolean;
  /** Exact inline scripts from this build; an empty list permits no inline script. */
  hashes?: readonly string[];
};

/** The policy as a list of directives, in the order they are sent. */
export function cspDirectives({ nonce, isDev, hashes }: CspOptions): string[] {
  const inlineScripts = [
    ...(nonce ? [`'nonce-${nonce}'`] : hashes === undefined ? ["'unsafe-inline'"] : []),
    ...(hashes ?? []),
  ].join(' ');
  const evalSrc = isDev ? " 'unsafe-eval'" : '';
  return [
    "default-src 'self'",
    // Google Analytics: src/services/analytics/gtag.ts adds gtag.js as a
    // plain <script src> from googletagmanager, and only after the person
    // allows Analytics. It is allowed by host (no nonce, no inline config
    // script), and it is the only third-party script host. Its beacons go
    // to *.google-analytics.com and its pixel to googletagmanager, which
    // connect-src and img-src already allow through `https:`.
    `script-src 'self' 'wasm-unsafe-eval'${evalSrc} ${inlineScripts} https://www.googletagmanager.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self' wss: https:",
    "font-src 'self' data:",
    `frame-src ${CSP_FRAME_SRC.join(' ')}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ];
}

/** The policy as a header value. */
export function buildCsp(opts: CspOptions): string {
  return cspDirectives(opts).join('; ');
}
