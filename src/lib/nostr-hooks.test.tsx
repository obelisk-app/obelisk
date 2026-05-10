import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';

const enqueueMock = vi.fn();
const querySyncMock = vi.fn();
vi.mock('@/lib/nostr-coalescer', () => ({
  sharedCoalescer: {
    enqueue: (req: any) => { enqueueMock(req); return () => {}; },
    querySync: (filters: any, opts: any) => querySyncMock(filters, opts),
  },
}));

import { useNostrQuery } from './nostr-hooks';

beforeEach(() => {
  enqueueMock.mockClear();
  querySyncMock.mockReset();
});

describe('useNostrQuery', () => {
  function Probe({ filters, enabled }: { filters: any[]; enabled?: boolean }) {
    const { events, loading, error } = useNostrQuery(filters, { enabled });
    return (
      <div>
        <div data-testid="loading">{String(loading)}</div>
        <div data-testid="count">{events.length}</div>
        <div data-testid="error">{error?.message ?? ''}</div>
      </div>
    );
  }

  it('starts loading=true and resolves to events from sharedCoalescer.querySync', async () => {
    querySyncMock.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const { getByTestId } = render(<Probe filters={[{ kinds: [0] }]} />);
    expect(getByTestId('loading').textContent).toBe('true');
    await waitFor(() => expect(getByTestId('loading').textContent).toBe('false'));
    expect(getByTestId('count').textContent).toBe('2');
    expect(querySyncMock).toHaveBeenCalledTimes(1);
  });

  it('forwards relays + timeoutMs to the coalescer', async () => {
    querySyncMock.mockResolvedValue([]);
    function P() {
      const r = useNostrQuery([{ kinds: [0] }], { relays: ['wss://x'], timeoutMs: 1234 });
      return <div>{String(r.loading)}</div>;
    }
    render(<P />);
    await waitFor(() => expect(querySyncMock).toHaveBeenCalled());
    expect(querySyncMock).toHaveBeenCalledWith(
      [{ kinds: [0] }],
      expect.objectContaining({ relays: ['wss://x'], timeoutMs: 1234 }),
    );
  });

  it('does not fire when enabled is false', () => {
    render(<Probe filters={[{ kinds: [0] }]} enabled={false} />);
    expect(querySyncMock).not.toHaveBeenCalled();
  });

  it('captures errors and surfaces them in `error`', async () => {
    querySyncMock.mockRejectedValue(new Error('relay sad'));
    const { getByTestId } = render(<Probe filters={[{ kinds: [0] }]} />);
    await waitFor(() => expect(getByTestId('loading').textContent).toBe('false'));
    expect(getByTestId('error').textContent).toBe('relay sad');
    expect(getByTestId('count').textContent).toBe('0');
  });

  it('does not re-fire on every render — stable filters/relays produce one call', async () => {
    querySyncMock.mockResolvedValue([]);
    function P({ tick }: { tick: number }) {
      const r = useNostrQuery([{ kinds: [0] }], { relays: ['wss://x'] });
      return <div>{tick}{r.loading ? '' : ''}</div>;
    }
    const { rerender } = render(<P tick={0} />);
    await waitFor(() => expect(querySyncMock).toHaveBeenCalled());
    rerender(<P tick={1} />);
    rerender(<P tick={2} />);
    rerender(<P tick={3} />);
    expect(querySyncMock).toHaveBeenCalledTimes(1);
  });

  it('discards stale results when filters change mid-flight', async () => {
    let resolveFirst: ((v: any[]) => void) | null = null;
    querySyncMock.mockImplementationOnce(() => new Promise((res) => { resolveFirst = res; }));
    querySyncMock.mockResolvedValueOnce([{ id: 'second-1' }, { id: 'second-2' }]);

    function P({ pubkey }: { pubkey: string }) {
      const { events, loading } = useNostrQuery([{ kinds: [0], authors: [pubkey] }]);
      return <div data-testid="probe">{loading ? 'loading' : events.map((e) => e.id).join(',')}</div>;
    }
    const { rerender, getByTestId } = render(<P pubkey="alice" />);
    rerender(<P pubkey="bob" />); // dep changes; stale resolution must be ignored

    // Resolve the FIRST (stale) call after the second has been issued.
    resolveFirst!([{ id: 'first-1' }]);
    await waitFor(() => expect(getByTestId('probe').textContent).toBe('second-1,second-2'));
  });
});
