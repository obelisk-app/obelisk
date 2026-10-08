import type { AbstractIntlMessages } from 'next-intl';

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
  /** `/`. */
  marketing: ['common', 'marketing'],
  /** Server-rendered public pages: only navigation is interactive. */
  public: ['common', 'marketing'],
  /** `/desktop`, `/mobile`. */
  showcase: ['common', 'marketing', 'showcase'],
  /** `/guides`, `/guides/<slug>`. */
  guides: ['common', 'marketing', 'guides'],
  /** `/media-kit`. */
  mediaKit: ['common', 'mediaKit'],
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

/** Subtrees needed by public client islands; server-rendered body copy is never serialized. */
const NAVIGATION_PATHS = ['marketing.nav', 'marketing.learn.card', 'marketing.footer'] as const;
const CLIENT_PATHS: Partial<Record<Scope, readonly string[]>> = {
  public: ['common', ...NAVIGATION_PATHS],
  guides: ['common', ...NAVIGATION_PATHS, 'guides.clip'],
  showcase: ['common', ...NAVIGATION_PATHS, 'showcase'],
};

/** Select only the message subtrees a scope renders in the browser. */
export function scopeMessages(messages: Record<string, unknown>, scope: Scope, inheritCommon = false): AbstractIntlMessages {
  const selected: Record<string, unknown> = {};
  for (const path of CLIENT_PATHS[scope] ?? SCOPES[scope]) {
    const keys = path.split('.');
    if (inheritCommon && keys[0] === 'common') continue;
    let value: unknown = messages;
    for (const key of keys) value = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
    if (value === undefined) continue;
    let target = selected;
    for (const key of keys.slice(0, -1)) {
      target[key] ??= {};
      target = target[key] as Record<string, unknown>;
    }
    target[keys[keys.length - 1]] = value;
  }
  return selected as AbstractIntlMessages;
}
