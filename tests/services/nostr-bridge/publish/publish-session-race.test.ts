import { expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import type { BridgeContext } from '@/services/nostr-bridge/facade/context';
import { PublishModule, type PublishDeps } from '@/services/nostr-bridge/publish/publish';
import { signForSession } from '@/services/nostr-bridge/publish/publish-sign';

vi.mock('@/services/nostr-bridge/publish/publish-sign', () => ({ signForSession: vi.fn() }));

it.each(['account', 'generation', 'signer'] as const)('never publishes when the %s changes while signing', async (change) => {
  let resolve!: (event: NostrEvent) => void;
  vi.mocked(signForSession).mockReturnValue(new Promise((done) => { resolve = done; }));
  let session = { pubKeyHex: 'a'.repeat(64), loginMethod: 'nip07' as const, relayUrl: 'wss://relay.example.com' };
  const ctx = { session: () => session, relays: () => [session.relayUrl] } as BridgeContext;
  const publisher = new PublishModule(ctx, {} as PublishDeps);
  const publish = vi.spyOn(publisher, 'publishSignedEvent').mockImplementation(async (event) => event);
  let current = true;
  const pending = publisher.signAndPublish({ kind: 0, content: '{}', tags: [], created_at: 1 }, {}, { assertCurrent: () => {
    if (!current) throw new DOMException('Replaced', 'AbortError');
  } });
  const result = pending.catch((error: Error) => error.name);
  if (change === 'account') session = { ...session };
  if (change === 'generation') current = false;
  resolve({ pubkey: change === 'signer' ? 'b'.repeat(64) : session.pubKeyHex, kind: 0, content: '{}', tags: [], created_at: 1, id: 'a'.repeat(64), sig: 'a'.repeat(128) });
  expect(await result).toBe('AbortError');
  expect(publish).not.toHaveBeenCalled();
});
