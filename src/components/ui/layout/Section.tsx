import type { HTMLAttributes, ReactNode } from 'react';
import Heading, { type HeadingProps } from './Heading';
import Text from './Text';
import { cn } from '@/utils/style/cn';

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  headingAs?: HeadingProps['as'];
  /** Article sections have an anchor offset; prose sections carry body typography. */
  variant?: 'article' | 'prose' | 'mobile';
  children?: ReactNode;
}

/** A titled content section with optional introductory copy. */
export default function Section({ title, description, headingAs = 'h2', variant = 'article', className, children, ...rest }: SectionProps) {
  if (variant === 'mobile') {
    return (
      <section className={cn('settings-section', className)} {...rest}>
        <Heading as={headingAs} className="settings-section-title">{title}</Heading>
        {description && <Text as="p" variant="muted">{description}</Text>}
        {children}
      </section>
    );
  }
  return (
    <section className={cn(variant === 'article' ? 'scroll-mt-24' : 'mt-10 text-base leading-7 text-lc-muted', className)} {...rest}>
      <div className={variant === 'article' ? 'mb-6' : 'mb-3'}>
        <Heading as={headingAs} variant={variant === 'article' ? 'article' : undefined} className={variant === 'article' ? 'sm:text-3xl' : 'text-xl font-bold text-lc-white'}>
          {title}
        </Heading>
        {description && (
          <Text as="p" variant="muted" className="mt-2 sm:text-base max-w-3xl">
            {description}
          </Text>
        )}
      </div>
      {children}
    </section>
  );
}
