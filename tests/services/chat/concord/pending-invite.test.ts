import { beforeEach, describe, expect, it } from 'vitest';
import { captureConcordInviteFragment, clearPendingConcordInvite, readPendingConcordInvite } from '@/services/chat/concord/pending-invite';

beforeEach(() => { clearPendingConcordInvite(); history.replaceState(null, '', '/app'); });
describe('Concord invite handoff', () => {
  it('captures before login without removing the recoverable fragment', () => {
    const invite = 'https://example.test/invite/test#test-capability';
    history.replaceState(null, '', `/app#concord-invite=${encodeURIComponent(invite)}`);
    expect(captureConcordInviteFragment(false)).toBe(true);
    expect(readPendingConcordInvite()).toBe(invite);
    expect(location.hash).not.toBe('');
    // The shell may replace its URL while the signer is still restoring.
    history.replaceState(null, '', '/app?relay=example.test');
    expect(captureConcordInviteFragment(true)).toBe(false);
    expect(readPendingConcordInvite()).toBe(invite);
  });

  it('removes the capability from the address once authenticated, preserving unrelated URL state', () => {
    history.replaceState(null, '', '/app?relay=example.test#concord-invite=test-capability');
    expect(captureConcordInviteFragment()).toBe(true);
    expect(location.hash).toBe('');
    expect(location.search).toBe('?relay=example.test');
    expect(readPendingConcordInvite()).toBe('test-capability');
    clearPendingConcordInvite();
    expect(readPendingConcordInvite()).toBe('');
  });
});
