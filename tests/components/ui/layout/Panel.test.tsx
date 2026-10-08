import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Panel from '@/components/ui/layout/Panel';

describe('Panel', () => {
  it('retains semantic chrome, an interactive header action and body content', () => {
    const onClick = vi.fn();
    render(<Panel title="Activity" action={<button onClick={onClick}>Refresh</button>} data-testid="panel"><span>Events</span></Panel>);
    const panel = screen.getByTestId('panel');
    expect(panel.tagName).toBe('SECTION');
    expect(panel).toHaveClass('rounded-xl', 'border-lc-border', 'bg-lc-dark/50', 'overflow-hidden');
    expect(screen.getByRole('heading', { level: 2 }).parentElement?.tagName).toBe('HEADER');
    expect(panel).toContainElement(screen.getByText('Events'));
    expect(screen.getByText('Events').parentElement).toHaveClass('p-1.5');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('allows heading levels and card presentation to follow the surrounding content', () => {
    render(<Panel title="Detail" headingAs="h3" surface="black" className="extra" data-testid="panel" />);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Detail');
    expect(screen.getByTestId('panel')).toHaveClass('bg-lc-black', 'extra');
  });
});
