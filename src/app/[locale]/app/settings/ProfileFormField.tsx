'use client';

/** A labelled field in the desktop profile editor. */
export function ProfileFormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-lc-muted">{label}</span>
      {children}
    </label>
  );
}
