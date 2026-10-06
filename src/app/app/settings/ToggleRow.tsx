'use client';

import Toggle from '@/components/ui/Toggle';

/** A labelled on/off setting: label and description on the left, the toggle on the right. */
export function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 cursor-pointer">
      <div className="min-w-0">
        <div className="text-sm text-lc-white">{label}</div>
        {description && <div className="text-xs text-lc-muted mt-0.5">{description}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </label>
  );
}
