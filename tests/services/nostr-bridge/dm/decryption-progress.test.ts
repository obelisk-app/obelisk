import { describe, expect, it } from 'vitest';
import type { Event } from 'nostr-tools';
import { DmDecryptionProgress } from '@/services/nostr-bridge/dm/decryption-progress';
const event = { id: 'wire', pubkey: 'ephemeral', created_at: 123, tags: [['p', 'me']] } as Event;
describe('encrypted envelope attribution', () => {
  it('keeps unknown senders hidden, then retains verified sender and Quantum format on failure', () => {
    const progress = new DmDecryptionProgress();
    progress.track('me', event, 'wrap', 'decrypting');
    expect(progress.snapshot(new Set())[0]).toMatchObject({ counterparty: null, encryption: 'unknown' });
    progress.track('me', event, 'wrap', 'decrypting', 'alice', true);
    progress.track('me', event, 'wrap', 'failed');
    progress.settle(event.id);
    expect(progress.snapshot(new Set())[0]).toMatchObject({ counterparty: 'alice', encryption: 'pq', status: 'failed' });
    expect(progress.snapshot(new Set())[0].createdAt).toBeUndefined();
    progress.track('me', event, 'wrap', 'decrypting');
    progress.settle(event.id);
    expect(progress.snapshot(new Set())).toEqual([]);
  });
  it('never assigns a self-copy to a conversation with yourself', () => {
    const progress = new DmDecryptionProgress();
    progress.track('me', event, 'wrap', 'decrypting', 'me');
    expect(progress.snapshot(new Set())[0]).toMatchObject({ counterparty: null, outgoing: true, encryption: 'nip44' });
    expect(progress.snapshot(new Set(['wire']))).toEqual([]);
    progress.track('me', event, 'wrap', 'failed');
    progress.clear();
    expect(progress.snapshot(new Set())).toEqual([]);
  });
});
