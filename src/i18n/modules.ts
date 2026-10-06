/**
 * The message modules: one JSON file per module per locale, under
 * `messages/<locale>/<module>.json`. A module is also the first segment of
 * every key in it (`chat.composer.send` lives in `messages/en/chat.json`
 * as `composer.send`).
 *
 * The split exists so a page ships only the copy it renders, in one
 * language: the landing page gets `common` and `marketing`, never the chat.
 * Which modules each route hands to the browser is `SCOPES` below, and
 * `tests/i18n/route-scopes.test.ts` fails when a client file reachable from
 * a route reads a module that route does not ship.
 *
 * `seo` is server-only: metadata, JSON-LD and OG images read it through
 * `getTranslations`, and no scope includes it.
 */

export const MODULES = [
  'common', 'seo', 'marketing', 'showcase', 'shell', 'mobile', 'chat', 'dm', 'calls', 'social',
  'settings', 'media', 'games', 'voice', 'admin', 'guides', 'help', 'mediaKit', 'errors',
] as const;

export type Module = (typeof MODULES)[number];

/** Modules each route family ships to the browser. `common` is in all of them. */
export const SCOPES = {
  /** The `[locale]` layout: toasts, the confirm dialog, appearance. */
  common: ['common'],
  /** `/`, `/features`. */
  marketing: ['common', 'marketing'],
  /** `/desktop`, `/mobile`. */
  showcase: ['common', 'marketing', 'showcase'],
  /** `/guides`, `/guides/<slug>`, `/help`. */
  guides: ['common', 'marketing', 'guides', 'help'],
  /** `/media-kit`. */
  mediaKit: ['common', 'marketing', 'mediaKit'],
  /**
   * `/notes/<id>`, `/p/<id>`, `/t/<tag>`: note cards embed media, packs and
   * games, and the profile header carries its menus. `errors` because the
   * reply composer names a failed publish by its code.
   */
  viewer: ['common', 'marketing', 'social', 'chat', 'media', 'games', 'mobile', 'settings', 'errors'],
  /**
   * `/app`, `/voice`, `/r/<code>`: everything but the public-page modules.
   * `help` is the help popover's topics (and the category copy of Settings >
   * Data on this device); the rest of `guides` stays out.
   */
  app: [
    'common', 'shell', 'mobile', 'chat', 'dm', 'calls', 'social', 'settings', 'media', 'games',
    'voice', 'admin', 'errors', 'help',
  ],
} as const satisfies Record<string, readonly Module[]>;

export type Scope = keyof typeof SCOPES;

/** The listed modules of an already-loaded message tree. */
export function pickModules<T extends Record<string, unknown>>(
  messages: T,
  modules: readonly Module[],
): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const m of modules) if (m in messages) out[m] = messages[m];
  return out as Partial<T>;
}
