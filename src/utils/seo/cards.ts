/**
 * What goes on a preview card, as data: the card component
 * (`src/components/seo/OgCard.tsx`) draws it, the routes' loaders
 * (`src/services/server/og/og-cards.ts`) fill it.
 */

import type { Locale } from '@/i18n';
import { localizedPath } from './alternates';

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

/** The pages whose card is their own `seo.<copy>` title and description. */
export const PAGE_CARDS = {
  landing: { copy: 'site', path: '/' },
  app: { copy: 'app', path: '/app' },
  voice: { copy: 'voice', path: '/voice' },
  features: { copy: 'features', path: '/features' },
  desktop: { copy: 'desktop', path: '/desktop' },
  mobile: { copy: 'mobile', path: '/mobile' },
  help: { copy: 'help', path: '/help' },
  helpLocalData: { copy: 'helpLocalData', path: '/help/local-data' },
  mediaKit: { copy: 'mediaKit', path: '/media-kit' },
  guides: { copy: 'guides', path: '/guides' },
} as const satisfies Record<string, { copy: string; path: string }>;

export type PageCard = keyof typeof PAGE_CARDS;

/** "obelisk.ar/es/help": the page's address, as the card's footer. */
export function cardFooter(locale: Locale, path: string): string {
  const p = localizedPath(locale, path);
  return `obelisk.ar${p === '/' ? '' : p}`; // i18n-exempt: the site's domain
}
