import { describe, expect, it } from 'vitest';
import { accessPillStyle, kindPillStyle } from '@/utils/shell/mobile/pill-styles';

describe('the channel-settings pills', () => {
  it('paint the picked access preset in the accent and the rest quiet', () => {
    expect(accessPillStyle(true)).toMatchObject({ border: '1px solid var(--accent)', color: 'var(--accent)', background: 'rgba(180, 249, 83, 0.08)', flex: 1 });
    expect(accessPillStyle(false)).toMatchObject({ border: '1px solid var(--app-line)', color: 'var(--app-text-dim)', background: 'var(--app-surface)' });
  });

  it('lay the kind pills two to a row', () => {
    expect(kindPillStyle(true)).toMatchObject({ flex: '1 1 calc(50% - 6px)', color: 'var(--accent)' });
    expect(kindPillStyle(false).border).toBe('1px solid var(--app-line)');
  });
});
