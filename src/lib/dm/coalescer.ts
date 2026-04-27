/**
 * Backward-compat re-export of the shared coalescer. DM modules originally
 * imported `RequestCoalescer` from `./coalescer`; that path stays valid, but
 * the implementation lives in `src/lib/nostr-coalescer.ts` so non-DM
 * consumers (profile editor, follower lists, etc.) can share the same
 * pending window.
 *
 * New code should import from `@/lib/nostr-coalescer` directly.
 */

export {
  RequestCoalescer,
  sharedCoalescer,
  type CoalescerEnqueue,
  type CoalescerOptions,
  type QuerySyncOptions,
} from '@/lib/nostr-coalescer';
