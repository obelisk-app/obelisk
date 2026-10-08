'use client';

import Button from '@/components/ui/buttons/Button';
import { useResourceCounter } from '@/hooks/games/vesta/useResourceCounter';

/** One resource's count in a discard or a trade: minus, the count, plus. */
export default function ResourceCounter({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  const vm = useResourceCounter({ value, max, onChange });
  return (
    <span className="inline-flex items-center gap-1 rounded border border-lc-border px-1.5 py-0.5 text-[11px]">
      <span>{label}</span>
      <Button variant="bare" type="button" onClick={vm.decrement} className="px-1 text-lc-muted">−</Button>
      <span className="w-3 text-center text-lc-white">{value}</span>
      <Button variant="bare" type="button" onClick={vm.increment} className="px-1 text-lc-muted">+</Button>
    </span>
  );
}
