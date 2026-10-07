'use client';

import Label from '@/components/ui/forms/Label';

/** A labelled form field in the desktop dialogs. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label className="block">
      <div className="mb-1 text-[11px] font-medium text-lc-muted">{label}</div>
      {children}
    </Label>
  );
}
