import { afterEach, describe, expect, it } from 'vitest';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { fakeBridge } from '@tests/support/fake-bridge';
import { captureActiveSession } from '@/services/session/connection';

afterEach(() => unregisterBridge());

describe('active session capability', () => {
  it('does not authorize a missing, logged-out or different account', () => {
    expect(captureActiveSession()).toBeNull();
    registerBridge(fakeBridge({ isLoggedIn: false }));
    expect(captureActiveSession()).toBeNull();
    registerBridge(fakeBridge({ myPubkey: 'alice' }));
    expect(captureActiveSession('bob')).toBeNull();
  });

  it('retires capabilities on same-account relogin or signer changes', () => {
    let generation = 1;
    const bridge = fakeBridge({ myPubkey: 'alice', myLoginMethod: 'nip07' }, { getSessionGeneration: () => generation });
    registerBridge(bridge);
    const connection = captureActiveSession('alice')!;
    expect(connection.loginMethod).toBe('nip07');
    expect(connection.isCurrent()).toBe(true);
    generation++;
    expect(connection.isCurrent()).toBe(false);
    expect(() => connection.assertCurrent()).toThrow('Session was replaced');
  });
});
