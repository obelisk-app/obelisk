/**
 * Social: publish. Values the code in `services/social/publish.ts` reads, kept
 * here so every reader imports the one copy.
 */

/**
 * NIP-89 client attribution. Every event we publish says who made it, which
 * is what lets other clients show "via Obelisk" and gives readers a route
 * back to the app. One tag, on everything we sign: a reaction published
 * without it is just as anonymous as a note.
 */
export const CLIENT_TAG: string[] = ['client', 'Obelisk'];
