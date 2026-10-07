import { describe, expect, it } from 'vitest';
import type { StarterPack } from '@/services/social/starter-packs';
import { starterPackFaces, starterPackRow } from '@/utils/social/starter-pack-rows';
import { STARTER_PACK_FACES } from '@/constants/social/starter-pack-rows';

const pk = (n: number) => n.toString(16).padStart(64, '0');
const pack = (members: string[], id = 'p'): StarterPack => ({
  id, title: 'T', description: '', image: null, curator: pk(999), members, createdAt: 1,
});

describe('starterPackRow', () => {
  it('counts who is already followed and who is new', () => {
    const row = starterPackRow(pack([pk(1), pk(2), pk(3)]), [pk(2)]);
    expect(row).toMatchObject({ already: 1, remaining: 2, overflow: 0 });
    expect(row.faces).toEqual([pk(1), pk(2), pk(3)]);
  });

  it('shows a dozen faces and counts the rest', () => {
    const members = Array.from({ length: 20 }, (_, i) => pk(i + 1));
    const row = starterPackRow(pack(members), []);
    expect(row.faces).toHaveLength(STARTER_PACK_FACES);
    expect(row.overflow).toBe(20 - STARTER_PACK_FACES);
  });
});

describe('starterPackFaces', () => {
  it('collects the shown members of every pack', () => {
    const many = Array.from({ length: 14 }, (_, i) => pk(i + 100));
    expect(starterPackFaces([pack([pk(1)], 'a'), pack(many, 'b')])).toEqual([pk(1), ...many.slice(0, STARTER_PACK_FACES)]);
  });
});
