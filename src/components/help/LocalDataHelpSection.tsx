import type { ReactNode } from 'react';

/** One titled section of the local-data help page. */
export default function LocalDataHelpSection({ title, testId, children }: { title: string; testId?: string; children: ReactNode }) {
  return (
    <section className="mt-10 text-base leading-7 text-lc-muted" data-testid={testId}>
      <h2 className="mb-3 text-xl font-bold text-lc-white">{title}</h2>
      {children}
    </section>
  );
}
