'use client';

import type { ReactNode } from 'react';
import Heading from '@/components/ui/layout/Heading';

/** One group of search results (people, tags, posts) under its heading. */
export default function FeedSearchSection({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section data-testid={testId}>
      <Heading as="h3" className="px-5 pb-2 pt-4 text-[10px] font-semibold uppercase tracking-wider text-lc-muted">
        {title}
      </Heading>
      {children}
    </section>
  );
}
