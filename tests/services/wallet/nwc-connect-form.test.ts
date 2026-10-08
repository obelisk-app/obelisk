import { describe, expect, it } from 'vitest';
import { nwcConnectForm } from '@/services/wallet/nwc-connect-form';

const LINK = `nostr+walletconnect://${'b'.repeat(64)}?relay=wss%3A%2F%2Frelay.example&secret=${'c'.repeat(64)}`;

describe('nwcConnectForm', () => {
  it('starts blank and is ready only for a link that reads as one, with an account', () => {
    const spec = nwcConnectForm('a'.repeat(64));
    expect(spec.initial).toEqual({ draft: '' });
    expect(spec.ready!({ draft: '' })).toBe(false);
    expect(spec.ready!({ draft: 'not a link' })).toBe(false);
    expect(spec.ready!({ draft: LINK })).toBe(true);
    expect(nwcConnectForm(null).ready!({ draft: LINK })).toBe(false);
  });

  it('clears the pasted credential after a connect', () => {
    expect(nwcConnectForm('a'.repeat(64)).resetOnSuccess).toBe(true);
  });
});
