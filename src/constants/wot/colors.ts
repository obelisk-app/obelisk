/**
 * Web of trust: colors. Values the code in `services/wot/colors.ts` reads,
 * kept here so every reader imports the one copy.
 */

import type { WotTier } from '@/services/wot/colors';

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
