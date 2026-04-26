import { describe, it, expect } from 'vitest';
import { resolveScope, type ResolvedPref } from './prefs';
import type { ScopeRef } from '@/lib/server/scope-chain';

const NOW = new Date('2026-04-26T12:00:00Z');
const FUTURE = new Date('2026-04-26T20:00:00Z').toISOString();
const PAST = new Date('2026-04-26T08:00:00Z').toISOString();

const channelChain: ScopeRef[] = [
  { type: 'channel', id: 'ch1' },
  { type: 'server', id: 's1' },
];

describe('resolveScope', () => {
  it('returns default when no prefs match', () => {
    const r = resolveScope([], channelChain, NOW);
    expect(r).toEqual<ResolvedPref>({ notifyLevel: 'mentions', mutedUntil: null });
  });

  it('channel-level pref wins over server-level pref', () => {
    const r = resolveScope([
      { id: '1', pubkey: 'x', scopeType: 'server', scopeId: 's1', notifyLevel: 'nothing', mutedUntil: null },
      { id: '2', pubkey: 'x', scopeType: 'channel', scopeId: 'ch1', notifyLevel: 'all', mutedUntil: null },
    ] as any, channelChain, NOW);
    expect(r.notifyLevel).toBe('all');
  });

  it('mute applies when mutedUntil is in the future', () => {
    const r = resolveScope([
      { id: '1', pubkey: 'x', scopeType: 'channel', scopeId: 'ch1', notifyLevel: null, mutedUntil: FUTURE },
    ] as any, channelChain, NOW);
    expect(r.mutedUntil).toEqual(new Date(FUTURE));
  });

  it('mute does NOT apply when mutedUntil has passed', () => {
    const r = resolveScope([
      { id: '1', pubkey: 'x', scopeType: 'channel', scopeId: 'ch1', notifyLevel: null, mutedUntil: PAST },
    ] as any, channelChain, NOW);
    expect(r.mutedUntil).toBeNull();
  });

  it('server-level mute inherits to channel when channel has no override', () => {
    const r = resolveScope([
      { id: '1', pubkey: 'x', scopeType: 'server', scopeId: 's1', notifyLevel: null, mutedUntil: FUTURE },
    ] as any, channelChain, NOW);
    expect(r.mutedUntil).toEqual(new Date(FUTURE));
  });

  it('DM scope chain resolves dm-type prefs', () => {
    const r = resolveScope([
      { id: '1', pubkey: 'x', scopeType: 'dm', scopeId: 'npub_alice', notifyLevel: 'nothing', mutedUntil: null },
    ] as any, [{ type: 'dm', id: 'npub_alice' }], NOW);
    expect(r.notifyLevel).toBe('nothing');
  });
});
