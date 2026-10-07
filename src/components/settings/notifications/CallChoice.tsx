'use client';

import Chip from '@/components/ui/data/Chip';

/** A row of radio chips for one call setting. */
export default function CallChoice<T extends string>({
  name, value, options, onChange, mobile,
}: {
  name: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (v: T) => void; mobile: boolean;
}) {
  return (
    <div className={mobile ? 'flex flex-wrap gap-2' : 'flex flex-wrap gap-1.5'} role="radiogroup">
      {options.map((o) => (
        <Chip
          key={o.value}
          behavior="radio"
          size="touch"
          state={value === o.value ? 'selected' : 'idle'}
          onClick={() => onChange(o.value)}
          className="font-semibold"
          data-testid={`${name}-${o.value}`}
        >
          {o.label}
        </Chip>
      ))}
    </div>
  );
}
