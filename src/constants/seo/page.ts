/**
 * SEO: page. Values the code in `utils/seo/page.ts` reads, kept here so every
 * reader imports the one copy.
 */

import type { Metadata } from 'next';

export const SITE_NAME = 'Obelisk';

/** What the layout's title template appends; `%s · Obelisk`. */
export const TITLE_SUFFIX = ' · Obelisk';

/** The X account behind the site: La Crypta, Obelisk's publisher (the only handle the project names). */
export const X_HANDLE = '@lacryptaar';

/** `noindex, follow`: links on the page still count, the page itself stays out of results. */
export const NOINDEX: NonNullable<Metadata['robots']> = { index: false, follow: true };
