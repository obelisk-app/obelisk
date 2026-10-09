import { expect, it } from 'vitest';
import { SessionState } from '@/services/nostr-bridge/session/state';

it('invalidates extension capabilities while identity verification is pending and after it completes', () => {
  const state = new SessionState();
  state.session = { pubKeyHex: 'alice', loginMethod: 'nip07', relayUrl: 'wss://relay.example' };
  const guard = state.captureSessionGuard();
  state.extensionIdentityRevision++;
  state.extensionIdentityPending.set(true);
  expect(guard).toThrow('Extension identity changed');
  state.extensionIdentityPending.set(false);
  expect(guard).toThrow('Extension identity changed');
  expect(state.captureSessionGuard()).not.toThrow();
});

it('does not let an unrelated extension event retire a bunker session', () => {
  const state = new SessionState();
  state.session = { pubKeyHex: 'alice', loginMethod: 'bunker', relayUrl: 'wss://relay.example' };
  const guard = state.captureSessionGuard();
  state.extensionIdentityRevision++;
  state.extensionIdentityPending.set(true);
  expect(guard).not.toThrow();
});
