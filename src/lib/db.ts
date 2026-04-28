// Stubbed during migration to nostrord. The Nostr-only build does not have a
// SQL database; modules that imported `prisma` (forum-tags, bots/poller,
// games/runtime) are not on the landing-page critical path but still need
// this symbol to type-check. Replace each call site as features are wired
// onto the WASM bridge.
export const prisma: any = new Proxy({}, {
  get() {
    throw new Error('prisma is not available in the Nostr-only build');
  },
});
