import { buildInviteLink } from '@applesauce/concord/helpers';
import { expect, it } from 'vitest';
import { parseConcordSharedInvite } from '@/schemas/chat/concord-shared-invite';

it('returns only a registered, unexpired web invite', () => {
  const signer = 'a'.repeat(64);
  const url = buildInviteLink('https://obelisk.example', signer, new Uint8Array(16), ['wss://chat.example']);
  const custom = { obelisk: { sharedInvite: { url, expiresAt: 200 } } };
  expect(parseConcordSharedInvite(custom, new Set([signer]), 100)).toBe(url);
  expect(parseConcordSharedInvite(custom, new Set(), 100)).toBeNull();
  expect(parseConcordSharedInvite(custom, new Set([signer]), 200)).toBeNull();
  expect(parseConcordSharedInvite({ obelisk: { sharedInvite: { url: 'javascript:alert(1)' } } }, new Set([signer]), 100)).toBeNull();
});
