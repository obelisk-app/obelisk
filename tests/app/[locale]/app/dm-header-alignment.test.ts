import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The DM list header and the open thread's header sit side by side, and their
 * bottom borders are meant to read as one line. The list header used to be
 * `h-14` while the thread header took its height from padding, leaving a
 * visible step between them. Both now carry the same explicit height.
 */
const heightOf = (file: string, testId: string): string | undefined => {
  const src = readFileSync(join(process.cwd(), 'src/app/[locale]/app', file), 'utf8');
  const tag = src.split('\n').find((line) => line.includes(`data-testid="${testId}"`));
  return tag?.match(/\bh-\[?[\w.]+\]?/)?.[0];
};

describe('DM header alignment', () => {
  it('the DM list header and the thread header have the same fixed height', () => {
    const list = heightOf('DMList.tsx', 'dm-list-header');
    const thread = heightOf('panes/DMPanel.tsx', 'dm-thread-header');
    expect(list).toBeDefined();
    expect(list).toBe(thread);
  });
});
