import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/** Tailwind gap scale used by the layout primitives. */
export type Gap = '0' | '0.5' | '1' | '1.5' | '2' | '2.5' | '3' | '4' | '5' | '6' | '8';

export const GAP_CLASS: Record<Gap, string> = {
  '0': 'gap-0',
  '0.5': 'gap-0.5',
  '1': 'gap-1',
  '1.5': 'gap-1.5',
  '2': 'gap-2',
  '2.5': 'gap-2.5',
  '3': 'gap-3',
  '4': 'gap-4',
  '5': 'gap-5',
  '6': 'gap-6',
  '8': 'gap-8',
};

export type Align = 'start' | 'center' | 'end' | 'stretch';

export const ALIGN_CLASS: Record<Align, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
};

export interface StackProps extends HTMLAttributes<HTMLElement> {
  gap?: Gap;
  align?: Align;
  as?: 'div' | 'section' | 'ul' | 'nav' | 'form' | 'header' | 'footer';
  children?: ReactNode;
}

/** A vertical flex column: `flex flex-col gap-N`. */
export default function Stack({ gap = '2', align, as: Tag = 'div', className, children, ...rest }: StackProps) {
  return (
    <Tag className={cn('flex flex-col', GAP_CLASS[gap], align && ALIGN_CLASS[align], className)} {...rest}>
      {children}
    </Tag>
  );
}
