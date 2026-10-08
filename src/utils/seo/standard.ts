/**
 * The metadata of a site page: one key (`PAGE_CARDS`, `constants/seo/cards.ts`)
 * names its copy (`seo.<copy>.title` / `.description`), its path and its
 * card, the PNG `npm run snap-og` drew for it. Most site pages are exactly
 * this; guides and the viewers build theirs from their content instead.
 */

import type { Metadata } from 'next';
import type { Locale } from '@/i18n';
import type { MessageKey, Translate } from '@/i18n/keys';
import type { PageCard } from './cards';
import { ogImage } from './og';
import { noindexMetadata, pageMetadata, renderedTitle, type PageSeo } from './page';
import { PAGE_CARDS } from '@/constants/seo/cards';

function copy(t: Translate, page: PageCard) {
  const { copy: key, path } = PAGE_CARDS[page];
  return { path, title: t(`seo.${key}.title` as MessageKey), description: t(`seo.${key}.description` as MessageKey) };
}

export function standardPageMetadata(
  t: Translate,
  locale: Locale,
  page: PageCard,
  extra: Pick<PageSeo, 'keywords' | 'absoluteTitle'> = {},
): Metadata {
  const { path, title, description } = copy(t, page);
  const image = ogImage(t, locale, { page }, renderedTitle(title, extra.absoluteTitle));
  return pageMetadata({ locale, path, title, description, image, ...extra });
}

/** The same, for a page kept out of search (the app shell, the voice tool). */
export function standardNoindexMetadata(t: Translate, locale: Locale, page: PageCard): Metadata {
  const { path, title, description } = copy(t, page);
  return noindexMetadata({ locale, path, title, description, image: ogImage(t, locale, { page }, renderedTitle(title)) });
}
