/**
 * Shared color tiers for WoT hop distances. Kept out of any React
 * component so the channel rail (`AppShell` GroupNode) and the legend in
 * the Preferences panel render with one source of truth. The legend's
 * words are message keys (`settings.wot.tier.*`), read where it renders.
 */

import type { MessageKey } from '@/i18n/keys';
import { WOT_TIERS } from '@/constants/wot/colors';

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

export function wotColorClass(distance: number | null): string {
  if (distance === null) return '';
  if (distance === 0) return WOT_TIERS[0].textClass;
  if (distance === 1) return WOT_TIERS[1].textClass;
  if (distance === 2) return WOT_TIERS[2].textClass;
  if (distance === 3) return WOT_TIERS[3].textClass;
  return WOT_TIERS[4].textClass;
}
