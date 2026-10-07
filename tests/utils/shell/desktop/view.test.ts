import { describe, expect, it } from 'vitest';
import { isViewingActiveCall } from '@/utils/shell/desktop/view';

describe('isViewingActiveCall', () => {
  it('is true only when the open group is the voice channel the user is in', () => {
    expect(isViewingActiveCall({ kind: 'group', groupId: 'v' }, 'v')).toBe(true);
    expect(isViewingActiveCall({ kind: 'group', groupId: 'other' }, 'v')).toBe(false);
    expect(isViewingActiveCall({ kind: 'group', groupId: 'v' }, null)).toBe(false);
    expect(isViewingActiveCall({ kind: 'dm', peer: null }, 'v')).toBe(false);
    expect(isViewingActiveCall({ kind: 'feed' }, 'v')).toBe(false);
  });
});
