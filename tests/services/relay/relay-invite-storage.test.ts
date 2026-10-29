import { beforeEach, describe, expect, it } from 'vitest';
import {
  forgetInvite,
  hasInviteWaitingForKey,
  markInviteSteered,
  markRedeemed,
  pendingInviteFor,
  readStoredInvite,
  storeInvite,
} from '@/services/relay/relay-invite-storage';
import { RELAY_INVITE_KEY } from '@/constants/relay/relay-invite';

const RELAY = 'wss://public.obelisk.ar';

describe('relay invite storage', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the code until it is used, and every key it let in', () => {
    storeInvite('code-1', RELAY);
    expect(hasInviteWaitingForKey(RELAY)).toBe(true);
    expect(pendingInviteFor(RELAY, 'pk1')?.code).toBe('code-1');

    markRedeemed('pk1');
    expect(pendingInviteFor(RELAY, 'pk1')).toBeNull();
    // A key made later still gets let in by the same code.
    expect(pendingInviteFor(RELAY, 'pk2')?.code).toBe('code-1');
    // Once any key used it, logging out does not make a key on its own.
    expect(hasInviteWaitingForKey(RELAY)).toBe(false);
  });

  it('keeps the redeemed list when the same link is opened again, and resets it for a new code', () => {
    storeInvite('code-1', RELAY);
    markRedeemed('pk1');
    storeInvite('code-1', RELAY);
    expect(readStoredInvite()?.redeemed).toEqual(['pk1']);
    storeInvite('code-2', RELAY);
    expect(readStoredInvite()).toEqual({ code: 'code-2', relay: RELAY, redeemed: [] });
  });

  it('ignores another relay, a corrupt record, and a forgotten invite', () => {
    storeInvite('code-1', RELAY);
    expect(pendingInviteFor('wss://other.example', 'pk')).toBeNull();
    localStorage.setItem(RELAY_INVITE_KEY, '{not json');
    expect(readStoredInvite()).toBeNull();
    storeInvite('code-1', RELAY);
    forgetInvite();
    expect(localStorage.getItem(RELAY_INVITE_KEY)).toBeNull();
  });

  it('remembers that the relay was offered or declined for this code, until the link is opened again', () => {
    storeInvite('code-1', RELAY);
    markInviteSteered('other-code', 'declined');
    expect(readStoredInvite()?.steer).toBeUndefined();
    markInviteSteered('code-1', 'declined');
    expect(readStoredInvite()).toEqual({ code: 'code-1', relay: RELAY, redeemed: [], steer: 'declined' });
    markRedeemed('pk1');
    expect(readStoredInvite()?.steer).toBe('declined');
    storeInvite('code-1', RELAY);
    expect(readStoredInvite()).toEqual({ code: 'code-1', relay: RELAY, redeemed: ['pk1'] });
  });
});
