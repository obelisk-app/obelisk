'use client';

/** A dialog section's title, with an optional hint on the right. */
export function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 className="shrink-0 text-sm font-bold text-lc-white">{title}</h3>
      {hint && <span className="break-words text-right text-[11px] text-lc-muted">{hint}</span>}
    </div>
  );
}
