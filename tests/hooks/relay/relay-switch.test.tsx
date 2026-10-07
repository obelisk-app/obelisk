/**
 * Switching relays must never show, or act on, the previous relay's operator
 * data, not even for one render.
 *
 * The hooks used to reset their state in an effect after the switch, so the
 * first render for relay B still returned relay A's operator, layout,
 * branding and roles. The operator one is the dangerous one: in that render
 * `useRelayOperatorData` subscribed relay B's layout (and branding, emoji and
 * roles) with relay A's operator as the trusted author, and showed the
 * operator-only settings to relay A's operator on relay B.
 */
import { renderHook } from '@testing-library/react';
import { useMemo } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelLayout } from '@/services/relay/channel-layout';
import type { RelayBranding } from '@/services/relay/relay-branding';
import type { RelayRoles } from '@/services/relay/relay-roles';

const A = 'wss://a.example';
const B = 'wss://b.example';

const t = vi.hoisted(() => ({
  operators: {} as Record<string, string | null>,
  pending: {} as Record<string, (info: { op: string | null }) => void>,
  subscriptions: [] as Array<{ kind: string; relay: string; authors: string[] }>,
  values: {} as Record<string, unknown>,
}));

vi.mock('@/services/relay/relay-info', () => ({
  fetchRelayInfo: (relay: string) => new Promise((resolve) => { t.pending[relay] = resolve; }),
  operatorPubkeyFromRelayInfo: (info: { op: string | null } | null) => info?.op ?? null,
}));

function fakeSubscribe(kind: string) {
  return (relay: string, authors: ReadonlyArray<string>, onChange: (value: unknown) => void) => {
    t.subscriptions.push({ kind, relay, authors: [...authors] });
    const value = t.values[`${kind}:${relay}`];
    if (value) onChange(value);
    return () => {};
  };
}

vi.mock('@/services/relay/channel-layout', async (orig) => ({
  ...(await orig<typeof import('@/services/relay/channel-layout')>()),
  subscribeLayout: fakeSubscribe('layout'),
}));
vi.mock('@/services/relay/relay-branding', async (orig) => ({
  ...(await orig<typeof import('@/services/relay/relay-branding')>()),
  subscribeBranding: fakeSubscribe('branding'),
}));
vi.mock('@/services/relay/relay-roles', async (orig) => ({
  ...(await orig<typeof import('@/services/relay/relay-roles')>()),
  subscribeRelayRoles: fakeSubscribe('roles'),
}));

import { act } from '@testing-library/react';
import { EMPTY_LAYOUT, relayOperatorAuthors } from '@/services/relay/channel-layout';
import { EMPTY_BRANDING } from '@/services/relay/relay-branding';
import { EMPTY_RELAY_ROLES } from '@/services/relay/relay-roles';
import { useChannelLayout } from '@/hooks/relay/useChannelLayout';
import { useRelayBranding } from '@/hooks/relay/useRelayBranding';
import { useRelayOperatorPubkey } from '@/hooks/relay/useRelayOperatorPubkey';
import { useRelayRoles } from '@/hooks/relay/useRelayRoles';

const LAYOUT_A: ChannelLayout = { categories: [{ id: 'c', name: 'A only', position: 0 }], channels: [], updatedAt: 5 };
const BRANDING_A: RelayBranding = { ...EMPTY_BRANDING, name: 'Relay A', updatedAt: 5 };
const ROLES_A: RelayRoles = { ...EMPTY_RELAY_ROLES, updatedAt: 5 };

beforeEach(() => {
  t.operators = {};
  t.pending = {};
  t.subscriptions = [];
  t.values = { [`layout:${A}`]: LAYOUT_A, [`branding:${A}`]: BRANDING_A, [`roles:${A}`]: ROLES_A };
});

async function answer(relay: string, op: string | null) {
  await act(async () => { t.pending[relay]?.({ op }); });
}

describe('switching relays', () => {
  it('never reports relay A operator as relay B operator', async () => {
    const seen: Array<[string, string | null]> = [];
    const { rerender } = renderHook(({ relay }) => {
      const op = useRelayOperatorPubkey(relay);
      seen.push([relay, op]);
      return op;
    }, { initialProps: { relay: A } });
    await answer(A, 'op-a');
    expect(seen.at(-1)).toEqual([A, 'op-a']);

    rerender({ relay: B });
    expect(seen.filter(([relay]) => relay === B).map(([, op]) => op)).not.toContain('op-a');
    await answer(B, 'op-b');
    expect(seen.at(-1)).toEqual([B, 'op-b']);
  });

  it("never subscribes relay B's operator data with relay A's operator as the author", async () => {
    const { rerender } = renderHook(({ relay }) => {
      const op = useRelayOperatorPubkey(relay);
      const authors = useMemo(() => relayOperatorAuthors(op), [op]);
      useChannelLayout(relay, authors);
      useRelayBranding(relay, authors);
      useRelayRoles(relay, authors);
    }, { initialProps: { relay: A } });
    await answer(A, 'op-a');
    expect(t.subscriptions.filter((s) => s.relay === A).map((s) => s.authors)).toContainEqual(['op-a']);

    rerender({ relay: B });
    await answer(B, 'op-b');
    const onB = t.subscriptions.filter((s) => s.relay === B);
    expect(onB.map((s) => s.authors)).not.toContainEqual(['op-a']);
    expect(onB.map((s) => s.kind).sort()).toEqual(['branding', 'layout', 'roles']);
  });

  it("never paints relay A's layout, branding or roles on relay B", () => {
    const seen: Array<[string, unknown[]]> = [];
    const authors = ['op'];
    const { rerender } = renderHook(({ relay }) => {
      const values = [useChannelLayout(relay, authors), useRelayBranding(relay, authors), useRelayRoles(relay, authors)];
      seen.push([relay, values]);
    }, { initialProps: { relay: A } });
    expect(seen.at(-1)).toEqual([A, [LAYOUT_A, BRANDING_A, ROLES_A]]);

    rerender({ relay: B });
    for (const [relay, values] of seen) {
      if (relay === B) expect(values).toEqual([EMPTY_LAYOUT, EMPTY_BRANDING, EMPTY_RELAY_ROLES]);
    }
  });

  it('keeps what it has while the operator list for the same relay changes', () => {
    const { result, rerender } = renderHook(({ authors }) => useChannelLayout(A, authors), {
      initialProps: { authors: ['op'] },
    });
    expect(result.current).toBe(LAYOUT_A);
    t.values = {};
    rerender({ authors: ['op', 'op-2'] });
    expect(result.current).toBe(LAYOUT_A);
  });
});
