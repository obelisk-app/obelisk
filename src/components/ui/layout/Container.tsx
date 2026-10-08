import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/style/cn';

export type ContainerWidth = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl';
const WIDTH: Record<ContainerWidth, string> = {
  sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl',
  '2xl': 'max-w-2xl', '3xl': 'max-w-3xl', '4xl': 'max-w-4xl', '5xl': 'max-w-5xl', '6xl': 'max-w-6xl',
};

export interface ContainerProps extends HTMLAttributes<HTMLElement> {
  width?: ContainerWidth;
  centeredText?: boolean;
  as?: 'div' | 'main' | 'section' | 'article' | 'header' | 'footer' | 'nav';
  children?: ReactNode;
}

/** Constrains page content and centers the block without adding another layout wrapper. */
export default function Container({ width = '6xl', centeredText = false, as: Tag = 'div', className, children, ...rest }: ContainerProps) {
  return <Tag className={cn('mx-auto', WIDTH[width], centeredText && 'text-center', className)} {...rest}>{children}</Tag>;
}
