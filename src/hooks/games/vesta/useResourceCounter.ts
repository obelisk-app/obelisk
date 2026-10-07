'use client';

import { decrementCount, incrementCount } from '@/utils/games/vesta/vesta-actions';

/** One resource's count in a draft: down to zero, up to `max`. */
export function useResourceCounter({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  return {
    decrement: () => onChange(decrementCount(value)),
    increment: () => onChange(incrementCount(value, max)),
  };
}
