import { describe, expect, it } from 'vitest';
import { forwardedContent } from '@/utils/chat/message/forward';
import { forwardTargets } from '@/utils/chat/message/forward';
import type { JsGroup } from '@/services/nostr-bridge';

describe('forwardedContent', () => {
  it('quotes every line under an attribution, naming the author in plain text (no npub → no ping)', () => {
    const out = forwardedContent({ content: 'line one\nline two' }, { authorName: 'Ana', fromChannel: 'general', label: 'Forwarded' });
    expect(out).toBe('**Forwarded** #general · Ana\n> line one\n> line two');
    expect(out).not.toMatch(/npub1/);
  });

  it('omits the channel when unknown', () => {
    expect(forwardedContent({ content: 'x' }, { authorName: 'Ana', fromChannel: null, label: 'Forwarded' })).toBe('**Forwarded** · Ana\n> x');
  });
});

describe('forwardTargets', () => {
  const g = (id: string, name: string | null, kind?: string) => ({ id, name, kind }) as unknown as JsGroup;
  it('leaves out the source channel, voice and publication channels, and matches by name or id', () => {
    const groups = [g('from', 'origin'), g('a', 'General'), g('b', null), g('v', 'voice', 'voice'), g('s', 'sfu', 'voice-sfu'), g('f', 'pubs', 'forum')];
    expect(forwardTargets(groups, 'from', '').map((x) => x.id)).toEqual(['a', 'b']);
    expect(forwardTargets(groups, 'from', ' gen ').map((x) => x.id)).toEqual(['a']);
    expect(forwardTargets(groups, 'from', 'b').map((x) => x.id)).toEqual(['b']);
  });
  it('stops at 50', () => {
    const many = Array.from({ length: 60 }, (_, i) => g(String(i), `c${i}`));
    expect(forwardTargets(many, 'x', '')).toHaveLength(50);
  });
});
