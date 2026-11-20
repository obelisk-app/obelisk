import { expect, it } from 'vitest';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
import { channelHierarchy } from '@/utils/chat/channel/channel-hierarchy';
import { descendantRows } from '@/utils/shell/panes/sidebar/channel-tree';
import { groupNodeIndent } from '@/utils/shell/panes/sidebar/group-node';

it('recovers nested Publications and makes their discussion rows leaves regardless of arrival order', () => {
  const outer = groupFixture({ id: 'outer', kind: 'forum' });
  const inner = { ...groupFixture({ id: 'inner', kind: 'forum' }), parent: outer.id };
  const discussion = { ...groupFixture({ id: 'discussion' }), parent: inner.id };
  const below = { ...groupFixture({ id: 'below' }), parent: discussion.id };
  expect(channelHierarchy([discussion]).roots).toEqual([discussion]);
  for (const groups of [[outer, inner, discussion, below], [below, discussion, inner, outer]]) {
    const hierarchy = channelHierarchy(groups);
    expect(hierarchy.roots.map(({ id }) => id).sort()).toEqual(['below', 'inner', 'outer']);
    expect(hierarchy.mobileRoots).toEqual(hierarchy.roots);
    expect(hierarchy.childrenByParent).toEqual({ inner: ['discussion'] });
    expect(inner.parent).toBe(outer.id);
  }
});

it('recovers cyclic, self-linked, and orphaned channels', () => {
  const groups = [['a', 'b'], ['b', 'a'], ['self', 'self'], ['orphan', 'missing']]
    .map(([id, parent]) => ({ ...groupFixture({ id }), parent }));
  expect(channelHierarchy(groups).roots).toEqual(groups);
});

it('keeps long ordinary chains accessible with bounded desktop indentation', () => {
  const groups = Array.from({ length: 2000 }, (_, n) => ({
    ...groupFixture({ id: String(n) }),
    parent: n === 0 ? null : String(n - 1),
  }));
  const { roots, mobileRoots, childrenByParent } = channelHierarchy(groups);
  const byId = Object.fromEntries(groups.map((group) => [group.id, group]));
  const rows = descendantRows(childrenByParent['0'], childrenByParent, byId);
  expect(roots).toEqual([groups[0]]);
  expect(mobileRoots).toEqual(groups);
  expect(rows.map(({ group }) => group)).toEqual(groups.slice(1));
  expect(groupNodeIndent(rows.at(-1)!.depth)).toBe(groupNodeIndent(5));
});
