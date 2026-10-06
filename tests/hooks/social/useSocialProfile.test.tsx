/**
 * A row that is reused for another author (a list re-keyed by position, the
 * profile pane switching people) must not paint the previous author's name
 * and picture under the new pubkey, not even for one render. It used to: the
 * reset ran in an effect after the switch.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocialProfile } from '@/services/social/profiles';

const t = vi.hoisted(() => ({
  known: {} as Record<string, SocialProfile>,
  listeners: {} as Record<string, (profile: SocialProfile | null) => void>,
  ensured: [] as string[],
}));

vi.mock('@/services/social/profiles', () => ({
  getSocialProfile: (pubkey: string) => t.known[pubkey] ?? null,
  subscribeSocialProfile: (pubkey: string, onChange: (profile: SocialProfile | null) => void) => {
    t.listeners[pubkey] = onChange;
    return () => { delete t.listeners[pubkey]; };
  },
  ensureSocialProfiles: async (pubkeys: readonly string[]) => { t.ensured.push(...pubkeys); },
}));

import { useSocialProfile } from '@/hooks/social/useSocialProfile';

const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);
const profile = (name: string): SocialProfile => ({ name } as SocialProfile);

/** What the real store does on a resolve: keep the value, then notify. */
function resolveProfile(pubkey: string, value: SocialProfile) {
  t.known[pubkey] = value;
  t.listeners[pubkey]?.(value);
}

beforeEach(() => {
  t.known = { [ALICE]: profile('Alice') };
  t.listeners = {};
  t.ensured = [];
});

describe('useSocialProfile', () => {
  it("never shows the previous author's profile for the next one", () => {
    const seen: Array<[string | null, string | null]> = [];
    const { rerender } = renderHook(({ pubkey }) => {
      const p = useSocialProfile(pubkey);
      seen.push([pubkey, p?.name ?? null]);
    }, { initialProps: { pubkey: ALICE as string | null } });
    expect(seen.at(-1)).toEqual([ALICE, 'Alice']);

    rerender({ pubkey: BOB });
    expect(seen.filter(([pk]) => pk === BOB).map(([, name]) => name)).not.toContain('Alice');
    rerender({ pubkey: null });
    expect(seen.filter(([pk]) => pk === null).map(([, name]) => name)).not.toContain('Alice');
  });

  it('shows a known profile at once, resolves the rest and follows updates', () => {
    const { result, rerender } = renderHook(({ pubkey }) => useSocialProfile(pubkey), {
      initialProps: { pubkey: BOB },
    });
    expect(result.current).toBeNull();
    expect(t.ensured).toContain(BOB);
    act(() => resolveProfile(BOB, profile('Bob')));
    expect(result.current?.name).toBe('Bob');

    rerender({ pubkey: ALICE });
    expect(result.current?.name).toBe('Alice');
  });
});
