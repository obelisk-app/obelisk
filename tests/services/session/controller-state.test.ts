import { describe, expect, it } from 'vitest';
import { createSessionController } from '@/services/session/controller';
import { fakeBridge } from '@tests/support/fake-bridge';

const PUBKEY = 'a'.repeat(64);

describe('authoritative session status', () => {
  it('keeps a restored account reconnecting after initialization settles', () => {
    const bridge = fakeBridge({ isLoggedIn: false, myPubkey: null, isRestoringSession: true });
    const controller = createSessionController(bridge, true);
    const stop = controller.start();
    expect(controller.getSnapshot()).toMatchObject({ ready: true, isRehydrating: true, isLoggedIn: false });
    bridge.stores.myPubkey.set(PUBKEY);
    bridge.stores.isLoggedIn.set(true);
    bridge.stores.isRestoringSession.set(false);
    expect(controller.getSnapshot()).toMatchObject({ isRehydrating: false, isLoggedIn: true, pubkey: PUBKEY });
    stop();
  });

  it('uses restoration completion, not leftover storage, to end the loading state', () => {
    localStorage.setItem('obelisk-dex/session', '{}');
    const bridge = fakeBridge({ isLoggedIn: false, myPubkey: null, isRestoringSession: false });
    const controller = createSessionController(bridge, true);
    const stop = controller.start();
    expect(controller.getSnapshot().isRehydrating).toBe(false);
    stop();
    localStorage.removeItem('obelisk-dex/session');
  });

  it('observes same-key session replacements even when the public identity does not change', () => {
    let emit: (generation: number) => void = () => {};
    const bridge = fakeBridge({ myPubkey: PUBKEY }, {
      subscribeSessionGeneration: (cb) => { emit = cb; cb(1); return () => {}; },
    });
    const controller = createSessionController(bridge, true);
    const stop = controller.start();
    const original = controller.getSnapshot();
    emit(2);
    expect(controller.getSnapshot()).toMatchObject({ pubkey: PUBKEY, generation: 2 });
    expect(controller.getSnapshot()).not.toBe(original);
    stop();
    emit(3);
    expect(controller.getSnapshot().generation).toBe(2);
  });
});
