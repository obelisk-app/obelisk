import { describe, expect, it } from 'vitest';
import { forwardedContent } from './ForwardMessageModal';

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
