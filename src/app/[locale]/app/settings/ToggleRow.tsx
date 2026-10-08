'use client';

import Text from '@/components/ui/layout/Text';
import Toggle from '@/components/ui/forms/Toggle';
import Label from '@/components/ui/forms/Label';

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
    <Label className="flex items-start justify-between gap-4 cursor-pointer">
      <div className="min-w-0">
        <Text as="div" size="sm" tone="default">{label}</Text>
        {description && <Text as="div" variant="caption" className="mt-0.5">{description}</Text>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </Label>
  );
}
