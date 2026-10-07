/**
 * The bridge: voice. Values the code in
 * `services/nostr-bridge/voice/voice-presence.ts` reads, kept here so every
 * reader imports the one copy.
 */

/**
 * Newest-beacon stamps kept, across every channel on the relay. LRU: a
 * participant still beaconing (every few seconds) stays; someone who left
 * long ago goes first. ~150 bytes an entry, so 2,000 is about 300 KB. An
 * evicted stamp only means an older replayed beacon from that pubkey is
 * read again, and a beacon that old is past its `expiration` and lands as
 * terminal, so nothing reappears in the roster.
 */
export const MAX_PRESENCE_STAMPS = 2000;
