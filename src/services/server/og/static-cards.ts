/**
 * The static pages' preview cards: every site page in `PAGE_CARDS` (the
 * landing page, the tours, help, the media kit, the guides index, the app
 * and the voice tool) and every guide, in each language. None depends on
 * live data, so `npm run snap-og` draws them once into `public/og/cards/`
 * (`snap.ts`), and a page names its file with `ogImage`.
 */

import type { ReactElement } from 'react';
import { DEFAULT_LOCALE, type Locale } from '@/i18n';
import type { Translate } from '@/i18n/keys';
import OgCard from '@/components/seo/OgCard';
import GuideOgCard from '@/components/guides/article/GuideOgCard';
import { listSlugs, readGuideOrNull } from '@/services/guides/guides';
import { guideCardProps } from '@/utils/seo/card-layout';
import { pageCardProps, type PageCard } from '@/utils/seo/cards';
import { staticCardFile, type StaticCardRef } from '@/utils/seo/og';
import { PAGE_CARDS } from '@/constants/seo/cards';

export type StaticCard = {
  ref: StaticCardRef;
  /** Relative to `public/`, as `staticCardFile` names it: `/og/cards/es/guides/vesta.png`. */
  file: string;
  element: ReactElement;
};

/** Every static card of one language; `t` is a translator for that language. */
export async function staticCards(t: Translate, locale: Locale): Promise<StaticCard[]> {
  const pages = (Object.keys(PAGE_CARDS) as PageCard[]).map((page) => ({
    ref: { page },
    file: staticCardFile(locale, { page }),
    element: OgCard(pageCardProps(t, locale, page)),
  }));
  // Slugs are shared across languages; a guide not yet translated falls back to English.
  const slugs = await listSlugs(DEFAULT_LOCALE);
  const guides = await Promise.all(slugs.map(async (slug) => ({
    ref: { guide: slug },
    file: staticCardFile(locale, { guide: slug }),
    element: GuideOgCard(guideCardProps(t, locale, await readGuideOrNull(locale, slug))),
  })));
  return [...pages, ...guides];
}
