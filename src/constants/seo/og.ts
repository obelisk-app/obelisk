import OG_CARD_VERSIONS_FILE from './og-card-versions.json';

/**
 * SEO: og. The preview cards' fixed values: their size and format, where
 * the pre-drawn cards of the static pages live, and the one route that
 * draws a live page's card on request. `utils/seo/og.ts` builds the URLs
 * from them; `services/server/og/` draws and writes the cards.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;

export const OG_TYPE = 'image/png';

/**
 * The static pages' cards, drawn once by `npm run snap-og` and committed:
 * `public/og/cards/<locale>/<page path>.png` (the landing page is `home`),
 * served at the same path.
 */
export const OG_STATIC_DIR = '/og/cards';

/** The landing page's file name: `/` has none of its own. */
export const OG_HOME_NAME = 'home';

/**
 * Each static card's version: a short hash of what it was drawn from (its
 * markup: text, layout, art), written by `npm run snap-og`. It is the
 * card's `?v=` in its URL, so a redrawn card gets a new address (and preview
 * platforms, which cache images by URL, fetch it again), and a test fails
 * when a card's text or drawing changes and the file was not drawn again.
 */
export const OG_MANIFEST = 'src/constants/seo/og-card-versions.json';

/** File (as `staticCardFile` names it) -> version. */
export const OG_CARD_VERSIONS: Readonly<Record<string, string>> = OG_CARD_VERSIONS_FILE;

/**
 * Cache-Control of a static card (`next.config.ts`): its URL carries its
 * version, so a file at a given URL never changes and may be kept for good.
 */
export const OG_STATIC_CACHE = 'public, max-age=31536000, immutable';

/**
 * Cache-Control of a live card (a note, a profile, a hashtag, a relay share
 * link). Names, pictures, bios and articles change, so it may not be kept
 * for good: browsers and preview bots keep it an hour, a shared cache (the
 * CDN) a day, and may serve it up to a week stale while it fetches a fresh
 * one, so a popular link never waits on the relays.
 */
export const OG_LIVE_CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

/**
 * Cache-Control of a live card drawn without the relays' answer (the note
 * or profile was not found, or a relay was slow): a minute, like the note
 * page itself, so the real card replaces it on the next request.
 */
export const OG_LIVE_MISS_CACHE = 'public, max-age=60, s-maxage=60';

/** The one route that draws a live page's card: `/<locale>/og/<kind>/<id>`. */
export const OG_LIVE_ROUTE = '/og';

/** The pages whose card depends on live data, so it is drawn on request. */
export const OG_LIVE_KINDS = ['note', 'profile', 'tag', 'relay'] as const;

export type OgLiveKind = (typeof OG_LIVE_KINDS)[number];
