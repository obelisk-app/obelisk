import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { ALIGN_CLASS, GAP_CLASS, type Align, type Gap } from './Stack';

export type Justify = 'start' | 'center' | 'end' | 'between';

const JUSTIFY_CLASS: Record<Justify, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
};

export interface RowProps extends HTMLAttributes<HTMLElement> {
  gap?: Gap;
  /** Defaults to `center`, the dominant hand-rolled row (`flex items-center gap-N`). */
  align?: Align;
  justify?: Justify;
  wrap?: 'wrap' | 'nowrap';
  as?: 'div' | 'span' | 'li' | 'header' | 'footer' | 'nav' | 'label';
  children?: ReactNode;
}

/** A horizontal flex row: `flex items-center gap-N`. */
export default function Row({
  gap = '2',
  align = 'center',
  justify,
  wrap,
  as: Tag = 'div',
  className,
  children,
  ...rest
}: RowProps) {
  return (
    <Tag
      className={cn(
        'flex',
        ALIGN_CLASS[align],
        GAP_CLASS[gap],
        justify && JUSTIFY_CLASS[justify],
        wrap === 'wrap' && 'flex-wrap',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
