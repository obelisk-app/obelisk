/**
 * What goes on a preview card, as data: the card components
 * (`src/components/seo/OgCard.tsx`, `RelayOgCard.tsx`) draw it; a site
 * page's card text is built here from its `seo` copy, a live page's by the
 * loaders in `src/services/server/og/og-cards.ts`.
 */

import type { Locale } from '@/i18n';
import type { MessageKey, Translate } from '@/i18n/keys';
import { localizedPath } from './alternates';
import { PAGE_CARDS } from '@/constants/seo/cards';

export type OgIconName =
  | 'landing' | 'app' | 'voice' | 'features' | 'desktop' | 'mobile' | 'help' | 'helpLocalData'
  | 'mediaKit' | 'guides' | 'note' | 'profile' | 'tag';

export type OgCardProps = {
  label: string;
  title: string;
  subtitle: string;
  footer: string;
  icon: OgIconName;
};

/** A relay share link's card: the relay's name and line, its logo as a data URI when it has one. */
export type RelayCardProps = {
  title: string;
  subtitle: string;
  tagline: string;
  logo: string | null;
};

export type PageCard = keyof typeof PAGE_CARDS;

/**
 * A live card's text, and whether the relays answered with what it shows
 * (`found: false`: drawn from what the URL says, so it is cached briefly).
 */
export type LiveCard<P> = { props: P; found: boolean };

/** "obelisk.ar/es/help": the page's address, as the card's footer. */
export function cardFooter(locale: Locale, path: string): string {
  const p = localizedPath(locale, path);
  return `obelisk.ar${p === '/' ? '' : p}`; // i18n-exempt: the site's domain
}

/** A site page's card, in `t`'s language: its label, its search title and description, its address. */
export function pageCardProps(t: Translate, locale: Locale, page: PageCard): OgCardProps {
  const { copy, path } = PAGE_CARDS[page];
  return {
    label: t(`seo.card.label.${page}` as MessageKey),
    title: t(`seo.${copy}.title` as MessageKey),
    subtitle: t(`seo.${copy}.description` as MessageKey),
    footer: cardFooter(locale, path),
    icon: page,
  };
}
