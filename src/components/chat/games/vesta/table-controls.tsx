'use client';

import { RESOURCES, RESOURCE_EMOJI, type ResourceCounts } from './resources';
import type { TradeResource } from 'vesta';
import Text from '@/components/ui/Text';
import UiChip from '@/components/ui/Chip';
import Button from '@/components/ui/Button';

/** Small buttons and counters shared by the Vesta table panels. */

export function ActionButton({ label, enabled, onClick }: { label: string; enabled: boolean; onClick: () => void }) {
  return (
    <Button
      variant="outlinePill"
      size="xs"
      disabled={!enabled}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

export function ModeToggle({ label, active, enabled, onClick }: { label: string; active: boolean; enabled: boolean; onClick: () => void }) {
  return (
    <UiChip size="11" state={active ? 'selected' : 'idle'} disabled={!enabled} onClick={onClick}>
      {label}
    </UiChip>
  );
}

export function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <UiChip size="10" state={active ? 'selected' : 'idle'} onClick={onClick}>
      {label}
    </UiChip>
  );
}

export function Counter({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-lc-border px-1.5 py-0.5 text-[11px]">
      <span>{label}</span>
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} className="px-1 text-lc-muted">−</button>
      <span className="w-3 text-center text-lc-white">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="px-1 text-lc-muted">+</button>
    </span>
  );
}

export function ResourceRow({
  label,
  values,
  setValues,
  max,
}: {
  label: string;
  values: ResourceCounts;
  setValues: (fn: (v: ResourceCounts) => ResourceCounts) => void;
  max: (r: TradeResource) => number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Text size="10" variant="label" tone="muted" className="w-9">{label}</Text>
      {RESOURCES.map((r) => (
        <Counter
          key={r}
          label={RESOURCE_EMOJI[r]}
          value={values[r] ?? 0}
          max={max(r)}
          onChange={(v) => setValues((cur) => ({ ...cur, [r]: v }))}
        />
      ))}
    </div>
  );
}
