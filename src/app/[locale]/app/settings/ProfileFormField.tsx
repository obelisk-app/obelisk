'use client';

import Text from '@/components/ui/layout/Text';
import Label from '@/components/ui/forms/Label';

/** A labelled field in the desktop profile editor. */
export function ProfileFormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label className="block">
      <Text variant="label" size="10" tone="muted" weight="semibold" className="mb-1 block">{label}</Text>
      {children}
    </Label>
  );
}
