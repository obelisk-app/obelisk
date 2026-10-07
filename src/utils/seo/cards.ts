/**
 * What goes on a preview card, as data: the card component
 * (`src/components/seo/OgCard.tsx`) draws it, the routes' loaders
 * (`src/services/server/og/og-cards.ts`) fill it.
 */

import type { Locale } from '@/i18n';
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

export type PageCard = keyof typeof PAGE_CARDS;

/** "obelisk.ar/es/help": the page's address, as the card's footer. */
export function cardFooter(locale: Locale, path: string): string {
  const p = localizedPath(locale, path);
  return `obelisk.ar${p === '/' ? '' : p}`; // i18n-exempt: the site's domain
}
