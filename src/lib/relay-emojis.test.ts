import { describe, expect, it } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import {
  parseRelayEmojiSet,
  relayEmojiMap,
  relayEmojiSetDTag,
  relayEmojiSetFromMap,
  toRelayEmojiSetTags,
} from '@/lib/relay-emojis';

function event(tags: string[][]): NostrEvent {
  return {
    id: 'event-id',
    pubkey: 'author-pubkey',
    created_at: 123,
    kind: 30030,
    tags,
    content: '',
    sig: 'sig',
  };
}

describe('relay emoji sets', () => {
  it('uses a relay-scoped deterministic d tag', () => {
    expect(relayEmojiSetDTag('wss://relay.example')).toBe('obelisk:emojis:wss://relay.example');
  });

  it('parses NIP-51 emoji set tags into a normalized relay emoji set', () => {
    const set = parseRelayEmojiSet(event([
      ['d', relayEmojiSetDTag('wss://relay.example')],
      ['title', 'Relay pack'],
      ['emoji', 'Party-Parrot', 'https://example.com/party.webp'],
      ['emoji', 'wave', 'https://example.com/wave.webp'],
      ['emoji', 'missing-url'],
    ]));

    expect(set).toEqual({
      title: 'Relay pack',
      emojis: [
        { name: 'party_parrot', url: 'https://example.com/party.webp' },
        { name: 'wave', url: 'https://example.com/wave.webp' },
      ],
      updatedAt: 123,
      author: 'author-pubkey',
    });
    expect(relayEmojiMap(set)).toEqual({
      party_parrot: 'https://example.com/party.webp',
      wave: 'https://example.com/wave.webp',
    });
  });

  it('serializes a set as NIP-51 emoji tags for the target relay', () => {
    const set = relayEmojiSetFromMap({
      party: 'https://example.com/party.webp',
      Wave: 'https://example.com/wave.webp',
    });

    expect(toRelayEmojiSetTags(set, 'wss://relay-two.example')).toEqual([
      ['d', 'obelisk:emojis:wss://relay-two.example'],
      ['title', 'Obelisk emojis'],
      ['emoji', 'party', 'https://example.com/party.webp'],
      ['emoji', 'wave', 'https://example.com/wave.webp'],
    ]);
  });
});
