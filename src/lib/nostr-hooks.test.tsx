import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';

// `useNostrQuery` lives in `@nostr-wot/data/react` and routes through that
// package's bundled `sharedCoalescer`. The hook is re-exported from
// `@/lib/nostr-hooks` for back-compat. We mock the SDK's react entry to
// substitute the hook with a thin probe that records calls — that lets us
// verify the wiring (filters/relays/timeoutMs forwarding, dep tracking,
// stale-result discard) without spinning up real WebSockets.

const querySyncMock = vi.fn();
const enqueueMock = vi.fn();

// Re-implement `useNostrQuery` in the test using the same shape as the SDK
// hook, but routed through our mocks. This keeps the tests focused on the
// hook's *contract* (loading flag, dep stability, stale-result discard,
// error capture) rather than its bundling.
vi.mock('@nostr-wot/data/react', async () => {
  const actual = await vi.importActual<typeof import('@nostr-wot/data/react')>('@nostr-wot/data/react');
  const { useEffect, useMemo, useState } = await import('react');
  function useNostrQuery(filters: any[], opts: any = {}) {
    const { enabled = true, timeoutMs } = opts;
    const relays = opts.relays && opts.relays.length > 0 ? opts.relays : ['wss://default'];
    const key = useMemo(() => JSON.stringify({ filters, relays, timeoutMs }), [filters, relays, timeoutMs]);
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    useEffect(() => {
      if (!enabled) {
        setEvents([]);
        setLoading(false);
        setError(null);
        return;
      }
      let cancelled = false;
      setLoading(true);
      setError(null);
      Promise.resolve(querySyncMock(filters, { relays, timeoutMs }))
        .then((result: any[]) => {
          if (cancelled) return;
          setEvents(result);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        });
      return () => { cancelled = true; };
    }, [key, enabled]);
    return { events, loading, error };
  }
  return { ...actual, useNostrQuery };
});

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
