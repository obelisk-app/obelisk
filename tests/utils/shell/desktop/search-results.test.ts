import { describe, expect, it } from 'vitest';
import type { JsGroup } from '@/services/nostr-bridge';
import { groupNamesById, nameInitial, showsEntitySections, userSearchRows } from '@/utils/shell/desktop/search-results';

const hit = (c: string) => ({ pubkey: c.repeat(64), displayName: c, picture: null, nip05: null });

describe('search results helpers', () => {
  it('badges the decoded key and the NIP-05 hit, and lists each person once', () => {
    const rows = userSearchRows(hit('a'), hit('b'), [hit('a'), hit('b'), hit('c')]);
    expect(rows.map((r) => [r.key.split('-')[0], r.hit.displayName, r.badge])).toEqual([
      ['direct', 'a', 'npub'], ['nip05', 'b', 'NIP-05'], ['nostr', 'c', undefined],
    ]);
  });

  it('drops a NIP-05 hit that is the decoded key', () => {
    expect(userSearchRows(hit('a'), hit('a'), []).map((r) => r.badge)).toEqual(['npub']);
    expect(userSearchRows(null, null, [hit('c')]).map((r) => r.key)).toEqual([`nostr-${'c'.repeat(64)}`]);
  });

  it('maps named channels by id', () => {
    const groups = [{ id: 'g1', name: 'General' }, { id: 'g2', name: null }] as unknown as JsGroup[];
    const names = groupNamesById(groups);
    expect(names.get('g1')).toBe('General');
    expect(names.has('g2')).toBe(false);
  });

  it('shows people and channels for free text only', () => {
    expect(showsEntitySections('alice', false)).toBe(true);
    expect(showsEntitySections('   ', false)).toBe(false);
    expect(showsEntitySections('from:alice', true)).toBe(false);
  });

  it('takes a name initial, or a question mark', () => {
    expect(nameInitial('alice')).toBe('A');
    expect(nameInitial('')).toBe('?');
  });
});
