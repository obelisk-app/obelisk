/**
 * Re-export of `@nostr-wot/data`'s subscription coalescer. Obelisk's
 * pattern has been lifted into the SDK; the local file stays as a thin
 * shim so existing import paths keep working — new code can import
 * directly from `@nostr-wot/data`.
 *
 * Note: the SDK's coalescer drives nostr-tools' `SimplePool`. Obelisk's
 * `getNostrPool()` already returned the same pool instance, so the
 * shared `sharedCoalescer` reaches the same connections.
 */
export {
  RequestCoalescer,
  sharedCoalescer,
  type CoalescerEnqueue,
  type CoalescerOptions,
  type QuerySyncOptions,
} from '@nostr-wot/data';
