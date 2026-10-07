'use client';

import type { ReactNode } from 'react';
import { useScrollReveal } from '@/hooks/marketing/useScrollReveal';

/**
 * A landing section that fades up the first time it scrolls into view and
 * stays hidden (`opacity-0`) until then. Each section owns its own reveal.
 */
export default function RevealSection({
  id,
  className,
  testId,
  children,
}: {
  id?: string;
  /** Layout classes; the reveal class is appended after them. */
  className: string;
  testId?: string;
  children: ReactNode;
}) {
  const [ref, visible] = useScrollReveal<HTMLElement>();
  return (
    <section
      id={id}
      ref={ref}
      data-testid={testId}
      className={`${className} ${visible ? 'animate-fade-in-up' : 'opacity-0'}`}
    >
      {children}
    </section>
  );
}
