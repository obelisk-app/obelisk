import { beforeEach, describe, expect, it } from 'vitest';
import { readForumCollapsed, writeForumCollapsed } from '@/services/shell/panes/sidebar/forum-collapsed';

beforeEach(() => localStorage.clear());

describe('forum-collapsed', () => {
  it('is open until a fold is saved', () => {
    expect(readForumCollapsed('f1')).toBe(false);
  });

  it('saves a fold as "1" under the shared key and clears it on unfold', () => {
    writeForumCollapsed('f1', true);
    expect(localStorage.getItem('obelisk-dex/forum-collapsed/f1')).toBe('1');
    expect(readForumCollapsed('f1')).toBe(true);
    expect(readForumCollapsed('f2')).toBe(false);
    writeForumCollapsed('f1', false);
    expect(localStorage.getItem('obelisk-dex/forum-collapsed/f1')).toBeNull();
  });

  it('reads only "1" as folded', () => {
    localStorage.setItem('obelisk-dex/forum-collapsed/f1', 'true');
    expect(readForumCollapsed('f1')).toBe(false);
  });
});
