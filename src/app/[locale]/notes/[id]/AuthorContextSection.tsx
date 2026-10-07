import type { ReactNode } from 'react';
import Heading from '@/components/ui/layout/Heading';

/** One titled block of the author context. */
export default function AuthorContextSection({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0" data-testid={testId}>
      <Heading as="h2" variant="label" className="mb-3">{title}</Heading>
      {children}
    </section>
  );
}
