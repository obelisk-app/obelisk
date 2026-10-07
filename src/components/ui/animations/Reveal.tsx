'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { useScrollReveal } from '@/hooks/common/useScrollReveal';
import { cn } from '@/utils/style/cn';

export interface RevealProps extends HTMLAttributes<HTMLElement> {
  /** `section` for a landing section (the default), `article` for a showcase row. */
  as?: 'section' | 'article';
  /** Layout classes; the reveal class is appended after them. */
  className?: string;
  children?: ReactNode;
}

/**
 * A block that fades up the first time it scrolls into view and stays hidden
 * (`opacity-0`) until then. Each block owns its own reveal; it does not fade
 * again when it scrolls back out.
 */
export default function Reveal({ as: Tag = 'section', className, children, ...rest }: RevealProps) {
  const [ref, visible] = useScrollReveal<HTMLElement>();
  return (
    <Tag ref={ref} className={cn(className, visible ? 'animate-fade-in-up' : 'opacity-0')} {...rest}>
      {children}
    </Tag>
  );
}
