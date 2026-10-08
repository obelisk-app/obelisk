import type { HTMLAttributes, ReactNode } from 'react';
import Reveal from '../animations/Reveal';
import { cn } from '@/utils/style/cn';

export interface PageSectionProps extends HTMLAttributes<HTMLElement> {
  /** Animate this same section element as it enters the viewport. */
  reveal?: boolean;
  children?: ReactNode;
}

/** Shared page-section gutters and vertical rhythm; content width belongs to Container. */
export default function PageSection({ reveal = false, className, children, ...rest }: PageSectionProps) {
  const classes = cn('px-6 py-24', className);
  if (reveal) return <Reveal className={classes} {...rest}>{children}</Reveal>;
  return <section className={classes} {...rest}>{children}</section>;
}
