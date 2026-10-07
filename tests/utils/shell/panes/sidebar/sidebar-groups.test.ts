import { describe, expect, it } from 'vitest';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
import { indexGroupsById, rootGroups } from '@/utils/shell/panes/sidebar/sidebar-groups';

describe('sidebar groups', () => {
  const top = groupFixture({ id: 'top' });
  const child = groupFixture({ id: 'child', parent: 'top' });
  const orphan = groupFixture({ id: 'orphan', parent: 'gone' });
  const all = [top, child, orphan];

  it('indexes by id', () => {
    expect(indexGroupsById(all)).toEqual({ top, child, orphan });
  });

  it('roots: no parent, or a parent this client does not know', () => {
    expect(rootGroups(all, indexGroupsById(all))).toEqual([top, orphan]);
  });
});
