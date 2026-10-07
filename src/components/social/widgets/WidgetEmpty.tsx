'use client';

import type { ReactNode } from 'react';
import Text from '@/components/ui/layout/Text';

/** The empty state, so every widget says "nothing yet" the same way. */
export default function WidgetEmpty({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <Text as="p" variant="caption" className="px-2 py-3 leading-5" data-testid={testId}>
      {children}
    </Text>
  );
}
