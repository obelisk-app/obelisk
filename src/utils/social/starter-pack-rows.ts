import { type StarterPack } from '@/services/social/starter-packs';
import { STARTER_PACK_FACES } from '@/constants/social/starter-pack-rows';

export interface StarterPackRow {
  pack: StarterPack;
  /** Members the reader already follows. */
  already: number;
  /** Members a follow would add. */
  remaining: number;
  /** The members shown as faces. */
  faces: string[];
  /** Members past the faces, shown as "+N" (0 when all fit). */
  overflow: number;
}

/** A pack as its card shows it: who is new, who is shown, how many are not. */
export function starterPackRow(pack: StarterPack, follows: readonly string[]): StarterPackRow {
  const already = followedCount(pack, follows);
  return {
    pack,
    already,
    remaining: pack.members.length - already,
    faces: pack.members.slice(0, STARTER_PACK_FACES),
    overflow: Math.max(0, pack.members.length - STARTER_PACK_FACES),
  };
}

/** Every member shown as a face, across packs: the profiles worth fetching in one query. */
export function starterPackFaces(packs: readonly StarterPack[]): string[] {
  return packs.flatMap((pack) => pack.members.slice(0, STARTER_PACK_FACES));
}

/** How many of a pack's members you already follow. */
export function followedCount(
  pack: StarterPack,
  follows: readonly string[],
): number {
  const set = new Set(follows.map((pubkey) => pubkey.toLowerCase()));
  return pack.members.filter((member) => set.has(member)).length;
}
