import type { TradeResource } from 'vesta';
import type { VestaAction } from '@/lib/games/vesta/definition';
import { RESOURCES, RESOURCE_EMOJI } from '@/constants/games/vesta';

export type ResourceCounts = Partial<Record<TradeResource, number>>;

export function tradeAction(
  partner: number | 'bank' | null,
  give: ResourceCounts,
  take: ResourceCounts,
): VestaAction {
  if (partner === 'bank') {
    return { type: 'trade', partner: 'bank', give: filled(give), take: filled(take) } as VestaAction;
  }
  return { type: 'propose-trade', partner: partner ?? 0, give: filled(give), take: filled(take) } as VestaAction;
}

export function filled(v: ResourceCounts): Record<TradeResource, number> {
  const out = { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 } as Record<TradeResource, number>;
  for (const r of RESOURCES) out[r] = v[r] ?? 0;
  return out;
}

export function sum(v: ResourceCounts): number {
  return RESOURCES.reduce((n, r) => n + (v[r] ?? 0), 0);
}

/** "2🧱 1🌾", or null for an empty side of a trade (the prompt words that). */
export function describe(v: ResourceCounts): string | null {
  const parts = RESOURCES.filter((r) => (v[r] ?? 0) > 0).map((r) => `${v[r]}${RESOURCE_EMOJI[r]}`);
  return parts.length > 0 ? parts.join(' ') : null;
}

