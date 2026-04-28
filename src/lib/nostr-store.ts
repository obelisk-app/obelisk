/**
 * Re-export of `@nostr-wot/data/cache`'s keyed observable.
 *
 * Obelisk's local copy of this primitive was lifted into the SDK so the
 * pattern can be shared across nostr-wot.com, the widgets renderer, the
 * extension, and any other consumer. The local file stays as a thin
 * shim so existing import paths in obelisk keep working — feel free to
 * import directly from `@nostr-wot/data/cache` in new code.
 */
export {
  createKeyedObservable,
  type KeyedObservable,
  type KeyedObservableOptions,
  type Slot,
  type SlotStatus,
} from '@nostr-wot/data/cache';
