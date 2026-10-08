/**
 * The preview card of a page drawn from live data, rendered on request by
 * the one live-card route (`src/app/[locale]/og/[kind]/[id]/route.ts`): a
 * note, a profile, a hashtag, a relay share link. The static pages' cards
 * are files (`static-cards.ts`); this is everything that cannot be one.
 */

import type { ReactElement } from 'react';
import OgCard from '@/components/seo/OgCard';
import RelayOgCard from '@/components/seo/RelayOgCard';
import { isLiveKind } from '@/utils/seo/og';
import { OG_LIVE_CACHE, OG_LIVE_MISS_CACHE, type OgLiveKind } from '@/constants/seo/og';
import { drawCard } from './draw';
import { noteCard, profileCard, relayCard, tagCard } from './og-cards';

type Drawn = { element: ReactElement; found: boolean };

async function liveCard(kind: OgLiveKind, locale: string, id: string): Promise<Drawn> {
  switch (kind) {
    case 'note': { const c = await noteCard(locale, id); return { element: OgCard(c.props), found: c.found }; }
    case 'profile': { const c = await profileCard(locale, id); return { element: OgCard(c.props), found: c.found }; }
    case 'tag': { const c = await tagCard(locale, id); return { element: OgCard(c.props), found: c.found }; }
    case 'relay': { const c = await relayCard(locale, id); return { element: RelayOgCard(c.props), found: c.found }; }
  }
}

/**
 * The card for `/<locale>/og/<kind>/<id>` as a PNG response; an unknown kind
 * is a 404. Cached for an hour (a day on the CDN, `OG_LIVE_CACHE`) since its
 * text can change; a minute when it was drawn without the relays' answer
 * (`OG_LIVE_MISS_CACHE`), so the real card follows soon. `next.config.ts`
 * leaves this route's Cache-Control to it.
 */
export async function liveCardResponse(locale: string, kind: string, id: string): Promise<Response> {
  if (!isLiveKind(kind)) return new Response(null, { status: 404 });
  const { element, found } = await liveCard(kind, locale, id);
  return drawCard(element, found ? OG_LIVE_CACHE : OG_LIVE_MISS_CACHE);
}
