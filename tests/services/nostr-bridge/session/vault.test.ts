import { describe, expect, it } from 'vitest';
import { SIGNER_STORAGE_KEY_NIP46, SIGNER_STORAGE_KEY_NSEC } from '@nostr-wot/ui';
import { VaultError } from '@/lib/crypto/session-vault';
import { forgetSdkSignerStorage, restoreNoticeFor } from '@/services/nostr-bridge/session/vault';
import { SDK_SIGNER_STORAGE_KEYS } from '@/constants/nostr-bridge/session';

describe('bridge session vault helpers', () => {
  it('erases exactly the keys the SDK login widget writes', () => {
    // If the SDK renames its keys, the bridge's copies stop erasing anything.
    expect([...SDK_SIGNER_STORAGE_KEYS].sort()).toEqual([SIGNER_STORAGE_KEY_NIP46, SIGNER_STORAGE_KEY_NSEC].sort());
    localStorage.setItem(SIGNER_STORAGE_KEY_NSEC, 'nsec1x');
    localStorage.setItem(SIGNER_STORAGE_KEY_NIP46, '{}');
    localStorage.setItem('obelisk:preferences', '{}');
    forgetSdkSignerStorage();
    expect(localStorage.getItem(SIGNER_STORAGE_KEY_NSEC)).toBeNull();
    expect(localStorage.getItem(SIGNER_STORAGE_KEY_NIP46)).toBeNull();
    expect(localStorage.getItem('obelisk:preferences')).toBe('{}');
  });

  it('maps each vault failure to the notice the login screen shows, and nothing else to a notice', () => {
    expect(restoreNoticeFor(new VaultError('unavailable'))).toBe('vault-unavailable');
    expect(restoreNoticeFor(new VaultError('key-missing'))).toBe('key-missing');
    expect(restoreNoticeFor(new VaultError('unlock-failed'))).toBe('unlock-failed');
    expect(restoreNoticeFor(new SyntaxError('bad json'))).toBeNull();
  });
});
