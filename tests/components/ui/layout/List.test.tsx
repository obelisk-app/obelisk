import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import List from '@/components/ui/layout/List';
import Text from '@/components/ui/layout/Text';

describe('List', () => {
  it('provides the standard readable bullet list without wrapping items', () => {
    render(<List aria-label="Facts"><li>One</li><li>Two</li></List>);
    const list = screen.getByRole('list');
    expect(list.tagName).toBe('UL');
    expect(list).toHaveClass('list-disc', 'space-y-2', 'pl-5');
    expect(list.children).toHaveLength(2);
  });
  it('keeps ordered and nested-circle semantics explicit', () => {
    render(<List as="ol"><li>First<List marker="circle" spacing="tight"><li>Detail</li></List></li></List>);
    const [ordered, nested] = screen.getAllByRole('list');
    expect(ordered.tagName).toBe('OL');
    expect(ordered).toHaveClass('list-decimal');
    expect(nested).toHaveClass('list-[circle]', 'space-y-1');
    expect(nested).not.toHaveClass('list-disc');
  });
  it('supports unmarked navigation lists and semantic time text', () => {
    render(<><List marker="none" spacing="relaxed"><li>Guide</li></List><Text as="time" dateTime="2026-10-08" size="10" tone="muted" className="ml-auto shrink-0">Today</Text></>);
    expect(screen.getByRole('list')).toHaveClass('list-none', 'space-y-2.5');
    expect(screen.getByRole('list')).not.toHaveClass('pl-5');
    expect(screen.getByText('Today').tagName).toBe('TIME');
    expect(screen.getByText('Today')).toHaveAttribute('datetime', '2026-10-08');
    expect(screen.getByText('Today')).toHaveClass('text-[10px]', 'text-lc-muted', 'ml-auto', 'shrink-0');
  });
});
