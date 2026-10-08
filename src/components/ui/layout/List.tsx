import type { HTMLAttributes } from 'react';
import { cn } from '@/utils/style/cn';

export interface ListProps extends HTMLAttributes<HTMLUListElement | HTMLOListElement> {
  as?: 'ul' | 'ol';
  marker?: 'outside' | 'inside' | 'none' | 'circle';
  spacing?: 'none' | 'tight' | 'normal' | 'relaxed';
}

const SPACING_CLASS = { none: '', tight: 'space-y-1', normal: 'space-y-2', relaxed: 'space-y-2.5' };

/** Readable content lists and unmarked link/row lists, retaining native list semantics. */
export default function List({ as: Tag = 'ul', marker = 'outside', spacing = 'normal', className, children, ...rest }: ListProps) {
  return (
    <Tag className={cn(
      marker === 'none' ? 'list-none' : marker === 'circle' ? 'list-[circle]' : Tag === 'ol' ? 'list-decimal' : 'list-disc',
      marker === 'inside' ? 'list-inside' : marker !== 'none' && 'pl-5',
      SPACING_CLASS[spacing], className,
    )} {...rest}>
      {children}
    </Tag>
  );
}
