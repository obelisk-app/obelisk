import type { ReactNode } from 'react';

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
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-lc-muted">{title}</h2>
      {children}
    </section>
  );
}
