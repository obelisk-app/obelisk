import type { OlHTMLAttributes } from 'react';
import { cn } from '@/utils/style/cn';

export interface ListProps extends OlHTMLAttributes<HTMLUListElement | HTMLOListElement> {
  as?: 'ul' | 'ol';
  marker?: 'outside' | 'inside' | 'none' | 'circle';
  spacing?: 'none' | 'tight' | 'normal' | 'relaxed';
}

const ORDERED_MARKER_CLASS = { '1': 'list-decimal', a: 'list-[lower-alpha]', A: 'list-[upper-alpha]', i: 'list-[lower-roman]', I: 'list-[upper-roman]' };

const SPACING_CLASS = { none: '', tight: 'space-y-1', normal: 'space-y-2', relaxed: 'space-y-2.5' };

/** Readable content lists and unmarked link/row lists, retaining native list semantics. */
export default function List({ as: Tag = 'ul', marker = 'outside', spacing = 'normal', type, className, children, ...rest }: ListProps) {
  return (
    <Tag type={Tag === 'ol' ? type : undefined} role={marker === 'none' ? 'list' : undefined} className={cn(
      marker === 'none' ? 'list-none' : marker === 'circle' ? 'list-[circle]' : Tag === 'ol' ? ORDERED_MARKER_CLASS[type ?? '1'] : 'list-disc',
      marker === 'inside' ? 'list-inside' : marker !== 'none' && 'pl-5',
      SPACING_CLASS[spacing], className,
    )} {...rest}>
      {children}
    </Tag>
  );
}
