import { cn } from './cn';
import { buttonClass, type ButtonSize, type ButtonVariant } from './button-class';

export type LinkVariant = 'plain' | 'text' | 'muted' | 'prose' | 'card' | 'button';

const VARIANT_CLASS: Record<Exclude<LinkVariant, 'button'>, string> = {
  plain: '',
  text: 'text-lc-green hover:underline',
  muted: 'text-lc-muted hover:text-lc-green',
  prose: 'text-lc-green underline underline-offset-2 hover:text-lc-green-dark',
  card: 'hover:border-lc-green',
};

export function linkClass(variant: LinkVariant, buttonVariant: ButtonVariant, size: ButtonSize, className?: string): string {
  return cn(
    variant === 'button' ? buttonClass({ variant: buttonVariant, size }) : cn(
      'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lc-green/60',
      VARIANT_CLASS[variant],
    ),
    className,
  );
}

/** Routing selection only; untrusted content must still use its feature's URL sanitizer. */
export function usesLocaleNavigation(href: string, download: unknown, native: boolean): boolean {
  return !native && (download === undefined || download === false) && href.startsWith('/') && !href.startsWith('//');
}

/** New tabs never receive an opener, even if callers supply additional rel tokens. */
export function safeLinkRel(target: string | undefined, rel: string | undefined): string | undefined {
  if (target !== '_blank') return rel;
  return [...new Set([...(rel?.split(/\s+/).filter(Boolean) ?? []), 'noopener', 'noreferrer'])].join(' ');
}
