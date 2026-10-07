/**
 * Social: starter pack rows. Values the code in
 * `utils/social/starter-pack-rows.ts` reads, kept here so every reader imports
 * the one copy.
 */

/**
 * How many members to name per pack.
 *
 * Six was too few to tell packs apart at a glance, but this also bounds a
 * profile fan-out on a discovery surface: every face is a kind-0 lookup
 * across the social relays, for every pack on screen.
 */
export const STARTER_PACK_FACES = 12;
