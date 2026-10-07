import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CallLiveness } from '@/services/call/call-liveness';
import { CONNECT_DEADLINE_MS, MAX_REBUILDS, RECONNECT_GIVE_UP_MS } from '@/services/call/session-config';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('CallLiveness', () => {
  it('gives up on a call that never connects, once', () => {
    const live = new CallLiveness();
    const expire = vi.fn();
    live.armConnectDeadline(expire);
    live.armConnectDeadline(expire);
    vi.advanceTimersByTime(CONNECT_DEADLINE_MS);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it('connecting cancels both clocks', () => {
    const live = new CallLiveness();
    const deadline = vi.fn();
    const giveUp = vi.fn();
    live.armConnectDeadline(deadline);
    live.armGiveUp(giveUp);
    live.connected();
    vi.advanceTimersByTime(CONNECT_DEADLINE_MS + RECONNECT_GIVE_UP_MS);
    expect(deadline).not.toHaveBeenCalled();
    expect(giveUp).not.toHaveBeenCalled();
    expect(live.everConnected).toBe(true);
  });

  it('a call that connected once never re-arms the connect deadline', () => {
    const live = new CallLiveness();
    live.connected();
    const deadline = vi.fn();
    live.armConnectDeadline(deadline);
    vi.advanceTimersByTime(CONNECT_DEADLINE_MS);
    expect(deadline).not.toHaveBeenCalled();
  });

  it('runs out of rebuilds only for a call that never connected', () => {
    const live = new CallLiveness();
    for (let i = 0; i < MAX_REBUILDS; i++) expect(live.rebuildExhausted()).toBe(false);
    expect(live.rebuildExhausted()).toBe(true);
    live.connected();
    for (let i = 0; i < MAX_REBUILDS + 2; i++) expect(live.rebuildExhausted()).toBe(false);
  });

  it('stop() silences both clocks', () => {
    const live = new CallLiveness();
    const deadline = vi.fn();
    const giveUp = vi.fn();
    live.armConnectDeadline(deadline);
    live.armGiveUp(giveUp);
    live.stop();
    vi.advanceTimersByTime(CONNECT_DEADLINE_MS + RECONNECT_GIVE_UP_MS);
    expect(deadline).not.toHaveBeenCalled();
    expect(giveUp).not.toHaveBeenCalled();
  });
});
