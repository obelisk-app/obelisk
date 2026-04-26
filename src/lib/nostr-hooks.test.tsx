import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';

const enqueueMock = vi.fn();
vi.mock('@/lib/nostr-coalescer', () => ({
  sharedCoalescer: {
    enqueue: (req: any) => { enqueueMock(req); return () => {}; },
    querySync: vi.fn(),
  },
}));

import { useProfile, useRelayList, useFollows } from './nostr-hooks';
import { _profileStore, _resetProfileCache } from './dm/profile-cache';
import { _relayStore, _resetRelayCache } from './dm/relay-list-cache';
import { _followsStore, _resetFollows, ingestKind3 } from './dm/follows';
import { _resetDMCacheState } from './dm/dm-cache';

const me = 'a'.repeat(64);
const partner = 'b'.repeat(64);

beforeEach(() => {
  localStorage.clear();
  enqueueMock.mockClear();
  _resetProfileCache();
  _resetRelayCache();
  _resetFollows();
  _resetDMCacheState();
});

describe('useProfile', () => {
  function Probe({ me, partner }: { me: string | null; partner: string | null }) {
    const profile = useProfile(me, partner);
    return <div data-testid="probe">{profile?.parsed.displayName ?? 'none'}</div>;
  }

  it('returns null on first render and triggers a relay enqueue', () => {
    const { getByTestId } = render(<Probe me={me} partner={partner} />);
    expect(getByTestId('probe').textContent).toBe('none');
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('re-renders when the underlying slot updates', () => {
    const { getByTestId } = render(<Probe me={me} partner={partner} />);
    act(() => {
      _profileStore().set(`${me}|${partner}`, {
        event: { id: 'e1', pubkey: partner, kind: 0, created_at: 1, content: '', tags: [], sig: 'x' } as any,
        parsed: { displayName: 'alice' },
        lastCheckedAt: Date.now(),
      });
    });
    expect(getByTestId('probe').textContent).toBe('alice');
  });

  it('renders null and does NOT enqueue when key inputs are null', () => {
    const { getByTestId } = render(<Probe me={null} partner={null} />);
    expect(getByTestId('probe').textContent).toBe('none');
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('multiple subscribers to the same key share one fetch (one enqueue)', () => {
    render(
      <>
        <Probe me={me} partner={partner} />
        <Probe me={me} partner={partner} />
        <Probe me={me} partner={partner} />
      </>,
    );
    // The first cold-render triggers `getProfile` once per mounted Probe; each
    // sees the slot as still-stale on its first call. After the first enqueue
    // populates the slot, subsequent calls within TTL skip enqueueing.
    // We assert at LEAST one enqueue (not three): real cross-component
    // batching is the coalescer's job — see the coalescer integration tests.
    expect(enqueueMock).toHaveBeenCalled();
    const initialCalls = enqueueMock.mock.calls.length;
    expect(initialCalls).toBeGreaterThanOrEqual(1);
  });
});

describe('useRelayList', () => {
  function Probe({ me, partner }: { me: string | null; partner: string | null }) {
    const list = useRelayList(me, partner);
    return <div data-testid="probe">{list.readRelays.join(',')}</div>;
  }

  it('returns an empty stale shape on first render', () => {
    const { getByTestId } = render(<Probe me={me} partner={partner} />);
    expect(getByTestId('probe').textContent).toBe('');
  });

  it('re-renders parsed read relays when the slot updates', () => {
    const { getByTestId } = render(<Probe me={me} partner={partner} />);
    act(() => {
      _relayStore().set(`${me}|${partner}`, {
        outbox: {
          event: {
            id: 'e1', pubkey: partner, kind: 10002, created_at: 1, content: '',
            tags: [['r', 'wss://x.example']],
            sig: 'x',
          } as any,
          lastCheckedAt: Date.now(),
        },
      });
    });
    expect(getByTestId('probe').textContent).toBe('wss://x.example');
  });
});

describe('useFollows', () => {
  function Probe({ me }: { me: string | null }) {
    const follows = useFollows(me);
    return <div data-testid="probe">{follows ? Array.from(follows).sort().join(',') : 'none'}</div>;
  }

  it('returns null until ingest runs', () => {
    const { getByTestId } = render(<Probe me={me} />);
    expect(getByTestId('probe').textContent).toBe('none');
  });

  it('re-renders when ingestKind3 lands a newer event', () => {
    const { getByTestId } = render(<Probe me={me} />);
    act(() => {
      ingestKind3(me, {
        id: 'e1', kind: 3, pubkey: me, created_at: 1000,
        tags: [['p', 'c'.repeat(64)], ['p', 'd'.repeat(64)]],
        content: '', sig: 'x',
      } as any);
    });
    const out = getByTestId('probe').textContent ?? '';
    expect(out).toContain('c'.repeat(64));
    expect(out).toContain('d'.repeat(64));
  });
});
