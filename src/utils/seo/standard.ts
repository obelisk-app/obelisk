/**
 * The metadata of a page whose copy is `seo.<copy>.title` and
 * `seo.<copy>.description`, with its own card at `<path>/opengraph-image`.
 * Most site pages are exactly this; guides and the viewers build theirs from
 * their content instead.
 */

import type { Metadata } from 'next';
import type { Locale } from '@/i18n';
import type { MessageKey, Translate } from '@/i18n/keys';
import { cardAlt, cardImage } from './og';
import { noindexMetadata, pageMetadata, renderedTitle, type PageSeo } from './page';

export type SeoCopy = 'site' | 'app' | 'voice' | 'features' | 'desktop' | 'mobile' | 'help' | 'helpLocalData' | 'mediaKit' | 'guides';

function copy(t: Translate, key: SeoCopy) {
  return { title: t(`seo.${key}.title` as MessageKey), description: t(`seo.${key}.description` as MessageKey) };
}

export function standardPageMetadata(
  t: Translate,
  locale: Locale,
  key: SeoCopy,
  path: string,
  extra: Pick<PageSeo, 'keywords' | 'absoluteTitle'> = {},
): Metadata {
  const { title, description } = copy(t, key);
  const image = cardImage(locale, path, cardAlt(t, renderedTitle(title, extra.absoluteTitle)));
  return pageMetadata({ locale, path, title, description, image, ...extra });
}

/** The same, for a page kept out of search (the app shell, the voice room). */
export function standardNoindexMetadata(t: Translate, locale: Locale, key: SeoCopy, path: string): Metadata {
  const { title, description } = copy(t, key);
  return noindexMetadata({ locale, path, title, description, image: cardImage(locale, path, cardAlt(t, renderedTitle(title))) });
}
