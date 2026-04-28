// src/lib/server/scope-chain.test.ts
import { describe, it, expect } from 'vitest';
import { buildScopeChain } from './scope-chain';

describe('buildScopeChain', () => {
  it('returns 2 elements for a channel inside a server, channel first', () => {
    expect(buildScopeChain({ channelId: 'ch_x', serverId: 's_y' })).toEqual([
      { type: 'channel', id: 'ch_x' },
      { type: 'server', id: 's_y' },
    ]);
  });

  it('returns 1 element for a server-only event', () => {
    expect(buildScopeChain({ serverId: 's_y' })).toEqual([
      { type: 'server', id: 's_y' },
    ]);
  });

  it('returns 1 element for a DM (counterparty pubkey)', () => {
    expect(buildScopeChain({ dmCounterparty: 'npub_alice' })).toEqual([
      { type: 'dm', id: 'npub_alice' },
    ]);
  });

  it('returns an empty chain when nothing is scoped (defensive)', () => {
    expect(buildScopeChain({})).toEqual([]);
  });
});
