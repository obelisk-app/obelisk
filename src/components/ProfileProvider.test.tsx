import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import type { Event as NostrEvent } from 'nostr-tools/pure';
import type { ProfileEntry } from '@/lib/dm/profile-cache';

const subscribeMock = vi.fn();
type SubArgs = {
  onCache?: (e: ProfileEntry) => void;
  onUpdate?: (e: ProfileEntry) => void;
};
const subsByPubkey = new Map<string, SubArgs>();

vi.mock('@/lib/dm/profile-cache', () => ({
  subscribeProfile: (me: string, partner: string, opts: SubArgs) => {
    subsByPubkey.set(partner, opts);
    subscribeMock(me, partner, opts);
    return () => { subsByPubkey.delete(partner); };
  },
}));

import { ProfileProvider, useProfile } from './ProfileProvider';

const me = 'a'.repeat(64);

beforeEach(() => {
  subscribeMock.mockClear();
  subsByPubkey.clear();
});

function makeEntry(overrides: Partial<ProfileEntry> = {}): ProfileEntry {
  return {
    event: { id: 'e1', pubkey: 'p1', kind: 0, created_at: 1, content: '{}', tags: [], sig: 's' } as NostrEvent,
    parsed: { name: 'Alice', picture: 'pic.jpg' },
    lastCheckedAt: Date.now(),
    ...overrides,
  };
}

function Probe({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  return <div data-testid="probe">{profile?.parsed.name ?? '—'}</div>;
}

describe('ProfileProvider', () => {
  it('useProfile returns null before any cache hydrate', () => {
    const r = render(
      <ProfileProvider me={me}>
        <Probe pubkey="pk1" />
      </ProfileProvider>,
    );
    expect(r.getByTestId('probe').textContent).toBe('—');
  });

  it('subscribes once per pubkey even with multiple consumers', async () => {
    render(
      <ProfileProvider me={me}>
        <Probe pubkey="pk1" />
        <Probe pubkey="pk1" />
        <Probe pubkey="pk1" />
      </ProfileProvider>,
    );
    // Allow the mounted-effect chain to settle.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(subscribeMock).toHaveBeenCalledWith(me, 'pk1', expect.any(Object));
  });

  it('subscribes per distinct pubkey', async () => {
    render(
      <ProfileProvider me={me}>
        <Probe pubkey="pk1" />
        <Probe pubkey="pk2" />
      </ProfileProvider>,
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(subscribeMock).toHaveBeenCalledTimes(2);
  });

  it('renders cached profile after onCache fires', async () => {
    const r = render(
      <ProfileProvider me={me}>
        <Probe pubkey="pk1" />
      </ProfileProvider>,
    );
    await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    await act(async () => {
      subsByPubkey.get('pk1')?.onCache?.(makeEntry({ parsed: { name: 'Cached Alice' } }));
      await new Promise((res) => setTimeout(res, 25)); // wait for batched flush
    });
    expect(r.getByTestId('probe').textContent).toBe('Cached Alice');
  });

  it('onUpdate replaces the rendered value', async () => {
    const r = render(
      <ProfileProvider me={me}>
        <Probe pubkey="pk1" />
      </ProfileProvider>,
    );
    await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    await act(async () => {
      subsByPubkey.get('pk1')?.onCache?.(makeEntry({ parsed: { name: 'Old' } }));
      await new Promise((res) => setTimeout(res, 25));
    });
    expect(r.getByTestId('probe').textContent).toBe('Old');
    await act(async () => {
      subsByPubkey.get('pk1')?.onUpdate?.(makeEntry({ parsed: { name: 'New' } }));
      await new Promise((res) => setTimeout(res, 25));
    });
    expect(r.getByTestId('probe').textContent).toBe('New');
  });
});
