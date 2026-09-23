'use client';

/**
 * The shell every side-column panel wears.
 *
 * The old panel's title was a bare uppercase grey line with 8px under it,
 * sitting flush against the content — it read as a stray label rather than
 * the head of a card. This gives it a rule to sit on, room to breathe, and
 * somewhere for a per-widget action to live, so two stacked panels read as
 * two things rather than one long list.
 */

import type { ReactNode } from 'react';

export default function WidgetCard({
  title,
  action,
  children,
  testId,
}: {
  title: string;
  /** Optional control in the header — "see all", a filter, the picker. */
  action?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="overflow-hidden rounded-xl border border-lc-border bg-lc-dark/50 backdrop-blur-sm"
      data-testid={testId}
    >
      <header className="flex items-center justify-between gap-2 border-b border-lc-border/70 px-3 py-2.5">
        <h2 className="min-w-0 truncate text-[13px] font-bold tracking-tight text-lc-white">
          {title}
        </h2>
        {action}
      </header>
      <div className="p-1.5">{children}</div>
    </section>
  );
}

/** The empty state, so every widget says "nothing yet" the same way. */
export function WidgetEmpty({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p className="px-2 py-3 text-xs leading-5 text-lc-muted" data-testid={testId}>
      {children}
    </p>
  );
}
