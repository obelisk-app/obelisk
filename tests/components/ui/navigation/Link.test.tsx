import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AnchorHTMLAttributes } from 'react';
import Link from '@/components/ui/navigation/Link';

const localized = vi.hoisted(() => vi.fn());
vi.mock('@/i18n/navigation', () => ({
  Link: (props: AnchorHTMLAttributes<HTMLAnchorElement> & { locale?: string; prefetch?: boolean; replace?: boolean; scroll?: boolean }) => {
    localized(props);
    const { locale, prefetch: _prefetch, replace: _replace, scroll: _scroll, ...rest } = props;
    return <a {...rest} href={`/${locale ?? 'es'}${props.href}`} />;
  },
}));

describe('Link', () => {
  it('preserves locale navigation, prefetch and router options for app paths', () => {
    render(<Link href="/app" locale="pt" prefetch={false} replace scroll={false} variant="button" buttonVariant="pill" size="lg">Launch</Link>);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/pt/app');
    expect(localized).toHaveBeenLastCalledWith(expect.objectContaining({ prefetch: false, replace: true, scroll: false }));
    expect(screen.getByRole('link')).toHaveClass('lc-pill-primary', 'text-base', 'focus-visible:ring-2');
  });

  it.each(['https://example.com', '//example.com', 'mailto:hello@example.com', '#details'])('uses a native anchor for %s', (href) => {
    const before = localized.mock.calls.length;
    render(<Link href={href} variant="text">Read</Link>);
    expect(screen.getByRole('link')).toHaveAttribute('href', href);
    expect(localized.mock.calls.length).toBe(before);
  });

  it('preserves download and native file links without locale prefixes', () => {
    render(<><Link href="/logo.svg" download="brand.svg">Download</Link><Link href="/logo.svg" native>View</Link></>);
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('href', '/logo.svg');
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('download', 'brand.svg');
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/logo.svg');
  });

  it('protects new tabs while retaining caller rel semantics and card styling', () => {
    render(<Link href="https://example.com" target="_blank" rel="nofollow noreferrer" variant="card" className="group">Partner</Link>);
    expect(screen.getByRole('link')).toHaveAttribute('rel', 'nofollow noreferrer noopener');
    expect(screen.getByRole('link')).toHaveClass('hover:border-lc-green', 'transition-colors', 'group');
  });

  it('does not change ordinary same-tab links into new tabs', () => {
    render(<Link href="https://example.com" variant="muted">License</Link>);
    expect(screen.getByRole('link')).not.toHaveAttribute('target');
    expect(screen.getByRole('link')).not.toHaveAttribute('rel');
    expect(screen.getByRole('link')).toHaveClass('text-lc-muted', 'hover:text-lc-green');
  });
});
