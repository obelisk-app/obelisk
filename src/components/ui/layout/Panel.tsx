import type { ReactNode } from 'react';
import Card, { type CardProps } from './Card';
import Heading, { type HeadingProps } from './Heading';
import { cn } from '@/utils/style/cn';
import Row from './Row';

export interface PanelProps extends Omit<CardProps, 'title'> {
  title: ReactNode;
  action?: ReactNode;
  headingAs?: HeadingProps['as'];
}

/** A bordered panel with a separated heading, optional action and inset body. */
export default function Panel({ title, action, headingAs = 'h2', children, className, ...rest }: PanelProps) {
  return (
    <Card as="section" surface="muted" padding="none" className={cn('overflow-hidden backdrop-blur-sm', className)} {...rest}>
      <Row as="header" justify="between" className="border-b border-lc-border/70 px-3 py-2.5">
        <Heading as={headingAs} className="min-w-0 truncate text-[13px] font-bold tracking-tight text-lc-white">
          {title}
        </Heading>
        {action}
      </Row>
      <div className="p-1.5">{children}</div>
    </Card>
  );
}
