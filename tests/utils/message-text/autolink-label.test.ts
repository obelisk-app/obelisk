import { describe, expect, it } from 'vitest';
import { autolinkLabel } from '@/utils/message-text/autolink-label';

describe('autolinkLabel', () => {
  it('leaves short and author-labelled links alone', () => {
    expect(autolinkLabel('https://a.example/', 'https://a.example/')).toBeNull();
    expect(autolinkLabel('https://a.example/' + 'x'.repeat(80), 'my label')).toBeNull();
  });

  it('shortens a long bare URL to host and path with an ellipsis', () => {
    const href = 'https://njump.me/' + 'naddr1'.padEnd(90, 'q');
    const label = autolinkLabel(href, [href]);
    expect(label).not.toBeNull();
    expect(label!.startsWith('njump.me/naddr1')).toBe(true);
    expect(label!.length).toBe(48);
    expect(label!.endsWith('…')).toBe(true);
  });
});
