import { describe, expect, it } from 'vitest';
import { threadTagState } from '@/utils/shell/mobile/thread-tags';

describe('threadTagState', () => {
  it('is active when picked, and a picked tag is never disabled', () => {
    expect(threadTagState(['a', 'b'], 'a', 2)).toEqual({ active: true, disabled: false });
  });

  it('disables an unpicked tag once the limit is reached', () => {
    expect(threadTagState(['a', 'b'], 'c', 2)).toEqual({ active: false, disabled: true });
    expect(threadTagState(['a'], 'c', 2)).toEqual({ active: false, disabled: false });
  });
});
