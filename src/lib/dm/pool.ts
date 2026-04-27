/**
 * DM-flavored re-exports of the shared browser Nostr pool + verifier.
 * Lives at this path for backward compatibility with the DM modules that
 * import `./pool`. The implementation is in `src/lib/nostr-pool.ts`.
 */

export {
  getNostrPool as getDMPool,
  resetNostrPool as resetDMPool,
  verifyNostrEvent as verifyDMEvent,
} from '@/lib/nostr-pool';
