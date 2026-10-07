'use client';

import type { TradeResource } from 'vesta';
import Text from '@/components/ui/layout/Text';
import { RESOURCES, RESOURCE_EMOJI, type ResourceCounts } from '@/utils/games/vesta/resources';
import ResourceCounter from './ResourceCounter';

/** One side of a trade (give or take): a counter per resource. */
export default function ResourceRow({
  label,
  values,
  onChange,
  max,
}: {
  label: string;
  values: ResourceCounts;
  onChange: (resource: TradeResource, value: number) => void;
  max: (r: TradeResource) => number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Text size="10" variant="label" tone="muted" className="w-9">{label}</Text>
      {RESOURCES.map((r) => (
        <ResourceCounter
          key={r}
          label={RESOURCE_EMOJI[r]}
          value={values[r] ?? 0}
          max={max(r)}
          onChange={(v) => onChange(r, v)}
        />
      ))}
    </div>
  );
}
