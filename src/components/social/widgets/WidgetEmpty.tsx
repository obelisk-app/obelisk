'use client';

import type { ReactNode } from 'react';

/** The empty state, so every widget says "nothing yet" the same way. */
export default function WidgetEmpty({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p className="px-2 py-3 text-xs leading-5 text-lc-muted" data-testid={testId}>
      {children}
    </p>
  );
}
