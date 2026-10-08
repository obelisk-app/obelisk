'use client';

import Text from '@/components/ui/layout/Text';
import Label from '@/components/ui/forms/Label';

/** A labelled form field in the desktop dialogs. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label className="block">
      <Text as="div" size="11" tone="muted" weight="medium" className="mb-1">{label}</Text>
      {children}
    </Label>
  );
}
