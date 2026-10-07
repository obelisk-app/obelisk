'use client';

import Heading from '@/components/ui/layout/Heading';

/** A dialog section's title, with an optional hint on the right. */
export function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <Heading as="h3" variant="panel" className="shrink-0">{title}</Heading>
      {hint && <span className="break-words text-right text-[11px] text-lc-muted">{hint}</span>}
    </div>
  );
}
