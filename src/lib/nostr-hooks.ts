/**
 * Backward-compat re-export of the SDK's `useNostrQuery`.
 *
 * The hook moved to `@nostr-wot/data/react`. Callers should migrate to
 * importing it from there directly; this file stays so existing imports
 * (`@/lib/nostr-hooks`) keep compiling.
 */

'use client';

export {
  useNostrQuery,
  type UseNostrQueryOptions as NostrQueryOptions,
  type UseNostrQueryResult as NostrQueryResult,
} from '@nostr-wot/data/react';
