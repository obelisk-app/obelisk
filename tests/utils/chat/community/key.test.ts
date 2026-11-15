import { describe, expect, it } from 'vitest';
import { communityChannelKey, communityKey } from '@/utils/chat/community/key';
import { parseConcordCreationRelays } from '@/schemas/chat/concord-relays';

describe('community isolation', () => {
  it('normalizes relay identities without changing channel ids', () => {
    expect(communityKey({ protocol: 'nip29', relay: 'wss://EXAMPLE.com/' }))
      .toBe(communityKey({ protocol: 'nip29', relay: 'wss://example.com' }));
  });

  it('isolates protocols and communities with identical channel ids', () => {
    const refs = [
      { protocol: 'nip29' as const, relay: 'wss://one.example' },
      { protocol: 'nip29' as const, relay: 'wss://two.example' },
      { protocol: 'concord' as const, communityId: 'wss://one.example' },
    ];
    expect(new Set(refs.map(community => communityChannelKey({ community, channelId: 'general' }))).size)
      .toBe(3);
  });
});

describe('Concord creation relay policy', () => {
  it('requires exactly three distinct secure endpoints', () => {
    expect(parseConcordCreationRelays(['wss://ONE.example/', 'wss://two.example', 'wss://three.example']))
      .toEqual(['wss://one.example', 'wss://two.example', 'wss://three.example']);
    for (const invalid of [null, [], ['wss://one.example'],
      ['wss://one.example', 'wss://ONE.example/', 'wss://three.example'],
      ['ws://one.example', 'wss://two.example', 'wss://three.example'],
      ['wss://user:secret@one.example', 'wss://two.example', 'wss://three.example'],
      ['wss://one.example/#secret', 'wss://two.example', 'wss://three.example']]) {
      expect(parseConcordCreationRelays(invalid)).toBeNull();
    }
  });
});
