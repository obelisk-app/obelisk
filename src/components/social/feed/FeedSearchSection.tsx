'use client';

import type { ReactNode } from 'react';
import Text from '@/components/ui/layout/Text';

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
      <Text as="h3" size="10" weight="semibold" variant="label" tone="muted" className="px-5 pb-2 pt-4">
        {title}
      </Text>
      {children}
    </section>
  );
}
