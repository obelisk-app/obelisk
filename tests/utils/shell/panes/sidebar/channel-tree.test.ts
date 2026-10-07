import { describe, expect, it } from 'vitest';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
import { channelTreeSections, knownGroups } from '@/utils/shell/panes/sidebar/channel-tree';

const a = groupFixture({ id: 'a' });
const b = groupFixture({ id: 'b' });
const byId = { a, b };

describe('knownGroups', () => {
  it('keeps the order and drops unknown ids', () => {
    expect(knownGroups(['b', 'x', 'a'], byId)).toEqual([b, a]);
  });
});

describe('channelTreeSections', () => {
  it('counts every channel a category holds but lists only the known ones', () => {
    const out = channelTreeSections({ categories: [{ id: 'c', name: 'Talk', channelIds: ['a', 'gone'] }], uncategorized: ['b'] }, byId);
    expect(out.categories).toEqual([{ id: 'c', name: 'Talk', channelCount: 2, groups: [a] }]);
    expect(out.uncategorized).toEqual([b]);
    expect(out.uncategorizedCount).toBe(1);
    expect(out.uncategorizedHeaded).toBe(true);
  });

  it('with no categories the uncategorized channels have no header', () => {
    const out = channelTreeSections({ categories: [], uncategorized: ['a', 'gone'] }, byId);
    expect(out.uncategorizedHeaded).toBe(false);
    expect(out.uncategorizedCount).toBe(2);
    expect(out.uncategorized).toEqual([a]);
  });
});
