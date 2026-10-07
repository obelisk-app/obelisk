'use client';

import type { ReactNode } from 'react';
import Text from '@/components/ui/layout/Text';

/** A titled group of rows in the "Sort & view" popover. */
export function SortViewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Text as="div" size="10" variant="label" tone="muted">{title}</Text>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
