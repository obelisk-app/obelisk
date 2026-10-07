import { followedCount, type StarterPack } from '@/services/social/starter-packs';

/**
 * How many members to name per pack.
 *
 * Six was too few to tell packs apart at a glance, but this also bounds a
 * profile fan-out on a discovery surface: every face is a kind-0 lookup
 * across the social relays, for every pack on screen.
 */
export const STARTER_PACK_FACES = 12;

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
