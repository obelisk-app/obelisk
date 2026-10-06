import type { NextConfig } from "next";
import { networkInterfaces } from "os";
import { buildCsp } from "./src/utils/csp";

// Dynamically collect all local IPs so any device on the network can access dev
const localIPs = Object.values(networkInterfaces())
  .flat()
  .filter((iface) => iface && !iface.internal && iface.family === 'IPv4')
  .map((iface) => iface!.address);

// The real, nonce-bearing CSP is set per request in src/proxy.ts. This is
// the static floor for the responses the proxy does not see: its matcher
// skips /api, /_next/static, /_next/image and files with an extension, and
// next@16.2.x shipped several "Middleware / Proxy bypass" advisories that
// let a page request skip it too. Without this header such a response
// carried no CSP at all. The floor is built from the same directive list
// as the proxy's policy with 'unsafe-inline' in place of the nonce, which
// makes it a strict superset: wherever both headers reach a browser the
// intersection is exactly the proxy policy, and alone it still pins script
// and frame hosts, blocks plugins, framing, base-uri and form-action. See
// src/utils/csp.ts for the reasoning and tests/utils/csp.test.ts for the pin.
const STATIC_CSP_FLOOR = buildCsp({
  nonce: null,
  isDev: process.env.NODE_ENV !== 'production',
});

/**
 * `*.dev.tsx` routes exist only while `next dev` is running.
 *
 * The screenshot harness at /dev/game-shots mounts real game components over
 * fixture logs so `npm run snap-games` can photograph them. It has no business
 * in a production bundle, and a `NODE_ENV` check inside the page would still
 * ship the route. Leaving the extension out of the production list means the
 * file is not a route at all when it matters.
 */
const pageExtensions = ['tsx', 'ts', 'jsx', 'js'];
if (process.env.NODE_ENV === 'development') pageExtensions.unshift('dev.tsx');

const nextConfig: NextConfig = {
  pageExtensions,
  // `vesta` is consumed straight from its GitHub source (its package `main`
  // is `src/vesta.ts`), so Next has to compile it like first-party code.
  // That is deliberate: it keeps us tracking upstream by version range
  // instead of forking the rules into this repo. See docs/games.md.
  transpilePackages: ['@nostr-wot/ui', '@nostr-wot/data', 'vesta'],
  /*
   * The public note/profile viewers (`/notes/[id]`, `/p/[id]`) open real
   * relay sockets on the server so link previews have content. Bundling
   * nostr-tools into the server chunk resolves it through its browser
   * condition, and `SimplePool` then returns nothing at all: the query
   * "succeeds" in a couple of seconds with an empty result, which is
   * indistinguishable from a missing note. Keeping it external makes the
   * server require the Node build from node_modules.
   */
  serverExternalPackages: ['nostr-tools'],
  allowedDevOrigins: [...localIPs, 'obelisk.fabri.lat', 'obelisk.wearebitcoin.org', 'obelisk.nostr-wtf.com', 'dex-test.obelisk.ar', 'obelisk.ar'],
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'dex.obelisk.ar' }],
        destination: 'https://obelisk.ar/:path*',
        permanent: true,
      },
      {
        source: '/chat',
        destination: '/app',
        permanent: true,
      },
      {
        source: '/chat/:path*',
        destination: '/app/:path*',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: STATIC_CSP_FLOOR },
        ],
      },
      // Force the browser to revalidate HTML documents on every navigation.
      // Without this, a deploy can leave a stale Next.js shell pinned in
      // disk cache for hours, even though the JS chunks themselves are
      // content-hashed (handled by /_next/static/* below). The 304 round-
      // trip costs ~one extra request per navigation; soft client-side
      // navigations skip it entirely.
      //
      // Scoped to "no extension" + the explicit "/" path so we don't
      // touch JSON/RSC/file-tree responses.
      {
        source: '/',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, must-revalidate' },
        ],
      },
      {
        source: '/:path((?!_next/|api/|.*\\.).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, must-revalidate' },
        ],
      },
      // The manifest is app-shell metadata, not user/session state. Keep it
      // revalidating so installed PWAs pick up icon/start_url/display changes.
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, must-revalidate' },
        ],
      },
      // Service worker updates must bypass browser/CDN caches so stale
      // installed PWAs can pick up new hashed chunk manifests after deploys.
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, must-revalidate' },
        ],
      },
      // Belt + suspenders: keep hashed Next.js static assets immutable
      // forever in production. In dev the chunk filenames are derived from
      // the source path (not content-hashed), so the same URL serves new
      // bytes after every rebuild. Marking those `immutable` poisons the
      // dev tunnel's CDN cache (Cloudflare keeps the stale chunk for a
      // year). Use no-store in dev so dev-raise tunnels always get fresh
      // bundles after edits.
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value:
              process.env.NODE_ENV === 'production'
                ? 'public, max-age=31536000, immutable'
                : 'no-store, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
