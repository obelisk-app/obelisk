/**
 * Shared color tiers for WoT hop distances. Kept out of any React
 * component so the channel rail (`AppShell` GroupNode) and the legend in
 * the Preferences panel render with one source of truth. The legend's
 * words are message keys (`settings.wot.tier.*`), read where it renders.
 */

import type { MessageKey } from '@/i18n/keys';

export interface WotTier {
  /** Hop distance this tier covers (`null` when 4+ groups together). */
  distance: number | null;
  label: string;
  descriptionKey: MessageKey;
  /** Tailwind classes for inline text (channel-name color). */
  textClass: string;
  /** Tailwind classes for outlined badge (legend swatches). */
  badgeClass: string;
}

export const WOT_TIERS: ReadonlyArray<WotTier> = [
  {
    distance: 0,
    label: '0°',
    descriptionKey: 'settings.wot.tier.you',
    textClass: 'text-lc-green font-semibold',
    badgeClass: 'border-lc-green/60 text-lc-green',
  },
  {
    distance: 1,
    label: '1°',
    descriptionKey: 'settings.wot.tier.direct',
    textClass: 'text-emerald-400',
    badgeClass: 'border-emerald-400/60 text-emerald-400',
  },
  {
    distance: 2,
    label: '2°',
    descriptionKey: 'settings.wot.tier.friend',
    textClass: 'text-yellow-400',
    badgeClass: 'border-yellow-400/60 text-yellow-400',
  },
  {
    distance: 3,
    label: '3°',
    descriptionKey: 'settings.wot.tier.three',
    textClass: 'text-orange-400',
    badgeClass: 'border-orange-400/60 text-orange-400',
  },
  {
    distance: null,
    label: '4°+',
    descriptionKey: 'settings.wot.tier.far',
    textClass: 'text-red-400',
    badgeClass: 'border-red-400/60 text-red-400',
  },
];

export function wotColorClass(distance: number | null): string {
  if (distance === null) return '';
  if (distance === 0) return WOT_TIERS[0].textClass;
  if (distance === 1) return WOT_TIERS[1].textClass;
  if (distance === 2) return WOT_TIERS[2].textClass;
  if (distance === 3) return WOT_TIERS[3].textClass;
  return WOT_TIERS[4].textClass;
}
