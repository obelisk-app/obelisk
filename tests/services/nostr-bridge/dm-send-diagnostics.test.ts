import { afterEach, expect, it, vi } from 'vitest';
import { Nip17SendModule } from '@/services/nostr-bridge/dm/nip17';
import { CodedError } from '@/utils/errors/codes';
import type { NostrSigner } from '@nostr-wot/signers';
import type { PersistedSession } from '@/services/nostr-bridge/session/session-storage';

vi.mock('@/services/chat/pq/send', () => ({ resolvePqSend: async () => null }));
afterEach(() => vi.restoreAllMocks());

it('reports the failing stage without exposing signer errors or DM contents', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const markFailed = vi.fn();
  const signer = { nip44Encrypt: vi.fn().mockRejectedValue(new CodedError('extension-no-nip44', 'private-error-payload')) } as unknown as NostrSigner;
  const sender = new Nip17SendModule({ session: () => ({ pubKeyHex: 'a'.repeat(64), loginMethod: 'nip07' }) as PersistedSession }, {
    dmSigner: () => signer,
    resolveGiftWrapRelays: vi.fn(), publishSignedEvent: vi.fn(), ownInbox: () => [],
    settle: { markFailed, replacePending: vi.fn() }, rememberOwn: vi.fn(),
  });
  await sender.publish({ recipientPubkey: 'b'.repeat(64), content: 'private-message', clientTag: 'private-tag', createdAt: 1000, extraTags: [] });
  expect(warn).toHaveBeenCalledWith('[dm] send failed', { stage: 'encrypt-and-sign', code: 'extension-no-nip44' });
  expect(JSON.stringify(warn.mock.calls)).not.toMatch(/private-/);
  expect(markFailed).toHaveBeenCalledWith('b'.repeat(64), 'private-tag');
});
