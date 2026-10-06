import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RelayDot, RelayStats } from '@/components/settings/social-relays/RelayIndicators';
import type { RelayStatus } from '@/services/social/relay-status';

const status = (over: Partial<RelayStatus>): RelayStatus => ({ state: 'connected', latencyMs: 42, notes: 3, ...over } as RelayStatus);

describe('RelayDot', () => {
  it.each([
    ['connected', 'bg-lc-green'],
    ['connecting', 'animate-pulse'],
    ['offline', 'bg-lc-muted'],
  ] as const)('%s is a named image dot', (state, cls) => {
    render(<RelayDot status={status({ state })} />);
    const dot = screen.getByRole('img', { name: state });
    expect(dot).toHaveClass(cls);
    expect(dot).toHaveAttribute('data-state', state);
  });

  it('no status reads as unknown', () => {
    render(<RelayDot />);
    expect(screen.getByRole('img', { name: 'unknown' })).toHaveClass('bg-lc-border');
  });

  it('a failed relay becomes a retry button', () => {
    const onRetry = vi.fn();
    render(<RelayDot status={status({ state: 'failed' })} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /failed.*retry/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('RelayStats', () => {
  it('shows latency and the delivered-note count', () => {
    render(<RelayStats status={status({})} />);
    expect(screen.getByTestId('relay-stats')).toHaveTextContent('42ms3');
  });

  it('renders nothing without a status, and hides an empty count', () => {
    const { container, rerender } = render(<RelayStats />);
    expect(container).toBeEmptyDOMElement();
    rerender(<RelayStats status={status({ latencyMs: null, notes: 0 })} />);
    expect(screen.getByTestId('relay-stats')).toHaveTextContent('');
  });
});
