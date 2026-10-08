/**
 * A static card's version: a short hash (16 hex digits) of its markup, which
 * holds its text and every shape and style of its drawing. `npm run snap-og`
 * records it (`OG_CARD_VERSIONS`, the `?v=` in the card's URL) and the
 * static-cards test compares it with today's cards.
 *
 * Its own module because it renders with `react-dom/server`, which Next.js
 * refuses in anything an App Router route imports: only `snap.ts` (the
 * script's work) and the test import it, never the live-card route
 * (`tests/app/route-imports.test.ts`).
 */

import type { ReactElement } from 'react';
import { createHash } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';

export function cardFingerprint(element: ReactElement): string {
  return createHash('sha256').update(renderToStaticMarkup(element)).digest('hex').slice(0, 16);
}
