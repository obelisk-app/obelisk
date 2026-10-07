/**
 * The trade panel's pieces: who this seat can trade with, how the bank's
 * rates read, and the most of a resource a trade may ask for.
 */
import type { TradeResource } from 'vesta';
import { RESOURCES, RESOURCE_EMOJI } from '@/utils/games/vesta/resources';

/** The take side of a trade is capped here (the bank's whole stock of one resource). */
export const TRADE_TAKE_MAX = 19;

/** Every seat but the acting one, with its index (the engine's player number). */
export function tradePartners(participants: readonly string[], actingIdx: number): Array<{ seat: string; index: number }> {
  return participants
    .map((seat, index) => ({ seat, index }))
    .filter((p) => p.index !== actingIdx);
}

/** "🧱4:1  🪵4:1  ...": this seat's bank rates, one per resource. */
export function bankRatesText(rates: Readonly<Record<TradeResource, number>>): string {
  return RESOURCES.map((r) => `${RESOURCE_EMOJI[r]}${rates[r]}:1`).join('  ');
}
