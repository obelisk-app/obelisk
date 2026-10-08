import type { Event as NostrEvent, EventTemplate } from 'nostr-tools';

/** Optional account-bound signing and cancellation checkpoints for public uploads. */
export interface BlossomUploadOptions {
  signEventTemplate?: (template: EventTemplate) => Promise<NostrEvent>;
  assertCurrent?: () => void;
}
