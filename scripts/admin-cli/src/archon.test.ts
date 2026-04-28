import { describe, it, expect } from 'vitest';
import { nip19 } from 'nostr-tools';
import { composeSuggestion, composeAlert, mentionToken } from './archon';

const HEX = 'a'.repeat(64);

describe('mentionToken', () => {
  it('produces a nostr:npub1 token that round-trips to the source hex', () => {
    const token = mentionToken(HEX);
    expect(token.startsWith('nostr:npub1')).toBe(true);
    const decoded = nip19.decode(token.slice('nostr:'.length));
    expect(decoded.type).toBe('npub');
    expect(decoded.data).toBe(HEX);
  });
});

describe('composeSuggestion', () => {
  it('mentions the target channel name and author when provided', () => {
    const out = composeSuggestion({
      targetChannelId: 'ch_x',
      targetChannelName: 'off-topic',
      authorMention: mentionToken(HEX),
      reason: 'Este es el canal de desarrollo.',
    });
    expect(out).toContain('**#off-topic**');
    expect(out).toContain('nostr:npub1');
    expect(out).toContain('Este es el canal de desarrollo.');
    expect(out.startsWith('🔷 **Archon:**')).toBe(true);
  });

  it('omits author and reason when not provided', () => {
    const out = composeSuggestion({
      targetChannelId: 'ch_x',
      targetChannelName: 'general',
    });
    expect(out).toBe('🔷 **Archon:** este mensaje encaja mejor en **#general**.');
  });
});

describe('composeAlert', () => {
  it('leads with the summary, appends link and mentions', () => {
    const out = composeAlert({
      summary: 'Posible spam en #general',
      mentions: [HEX, 'b'.repeat(64)],
      link: 'https://obelisk.example/chat?c=general&m=abc',
    });
    const lines = out.split('\n');
    expect(lines[0].startsWith('⚠️ **Archon alert:**')).toBe(true);
    expect(lines[0]).toContain('Posible spam en #general');
    expect(lines[1]).toContain('https://obelisk.example/chat');
    expect(lines[2].split(' ')).toHaveLength(2);
    expect(lines[2]).toContain('nostr:npub1');
  });

  it('works with no mentions or link', () => {
    const out = composeAlert({ summary: 'heads up', mentions: [] });
    expect(out).toBe('⚠️ **Archon alert:** heads up');
  });
});
