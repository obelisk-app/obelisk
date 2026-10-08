# Static public pages and document security

Public site content is generated per locale during `npm run build`. The build must produce immutable HTML for the landing page, Features, desktop/mobile tours, media kit, help, local-data help, guide index and every guide. Guide slugs reject runtime generation. A deployment updates these artifacts; there is no timed HTML revalidation.

The shared locale root reads its language from `next/root-params`, not request headers. Public pages must not introduce request-specific cookies, headers, search parameters or nonce values into their render tree. The app, voice, public relay-backed viewers, relay-share routes and catch-all error route explicitly remain dynamic. Single-page viewers and relay-share routes declare this on the page itself, alongside their scope and bridge provider.

## CSP follows the document

The final build step, `scripts/security/generate-static-csp.ts`, parses prerendered HTML and hashes each inline script's exact browser text. It writes `.next/server/static-csp.json`, bound to `.next/BUILD_ID`. It rejects missing public routes, locale gaps and routes with timed regeneration. Generated error documents contribute fallback hashes.

The proxy uses the manifest's exact locale-normalized route map. Static documents authorize their compiled inline scripts by SHA-256; dynamic documents receive a fresh nonce. The proxy forwards the actual CSP request header because Next reads that header when stamping its bootstrap scripts. Caller-supplied CSP and nonce headers are replaced. Both policies retain the existing script hosts and prohibit arbitrary inline execution. The static floor in `next.config.ts` continues to cover requests outside the proxy matcher.

PWA launch redirection and registration are same-origin external scripts. The early redirect intentionally uses a native blocking script so installed launches redirect before the landing paints, without an inline Next Script bootstrap. Registration also works when hydration finishes after the load event.

## Deployment and caches

Run the complete `npm run build`, including manifest generation, and ship its `.next/server/static-csp.json` alongside the same build's HTML and `BUILD_ID`. A missing or mismatched manifest makes proxied production requests fail closed with a non-cacheable 503. Do not ignore a failed generation step, mix artifacts from different builds, regenerate these public pages with ISR, or let a CDN rewrite inline scripts.

Indefinite generation caching refers to Next's server-side build artifacts. Browsers still revalidate HTML so deployments can replace pages promptly; hashed JavaScript assets remain immutable. This does not promise indefinite browser or CDN retention, or that a hosting platform never evicts cached data. User-specific locale redirects also remain request-dependent.

Adding a public route requires adding its base path to the generator's required-page list and checking every supported locale. Any future request-dependent page belongs outside the immutable route set and needs a dynamic render boundary.

## Verification

The production build reports 63 public pages as SSG and app/viewer/voice routes as dynamic. HTTP checks across all 63 public pages confirmed cache hits, identical HTML and CSP on repeated requests, and authorization of every inline script by its response policy. The largest measured CSP header was 1,795 bytes. Dynamic app documents use fresh nonces; encoded paths, missing pages/guides, query strings and spoofed request security headers were also exercised.

A Chromium pass covered landing, Features, guides, help, local-data help, both tours, media kit and localized Features pages. It checked CSP violations and runtime errors, persistent client navigation from the public site into the app and back, and rejection of an unauthorized inline script. Repeat these checks whenever rendering or security policy changes; the manifest remains specific to each completed build.
