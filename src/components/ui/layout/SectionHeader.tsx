import type { HTMLAttributes, ReactNode } from 'react';
import Heading, { type HeadingProps } from './Heading';
import Text from './Text';
import { cn } from '@/utils/style/cn';

export interface SectionHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  hint?: ReactNode;
  headingAs?: HeadingProps['as'];
}

/** Compact panel or form-section heading with an optional trailing hint. */
export default function SectionHeader({ title, hint, headingAs = 'h3', className, ...rest }: SectionHeaderProps) {
  return (
    <div className={cn('flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1', className)} {...rest}>
      <Heading as={headingAs} variant="panel" className="shrink-0">{title}</Heading>
      {hint && <Text size="11" tone="muted" className="break-words text-right">{hint}</Text>}
    </div>
  );
}
