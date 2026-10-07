import { describe, expect, it } from 'vitest';
import { callStatusKey, dmCallBusy } from '@/utils/call/call-status';

describe('callStatusKey', () => {
  it('names the set-up stages and nothing once the call is up', () => {
    expect(callStatusKey('outgoing')).toBe('calls.call.calling');
    expect(callStatusKey('connecting')).toBe('calls.call.connecting');
    expect(callStatusKey('reconnecting')).toBe('calls.call.reconnecting');
    expect(callStatusKey('active')).toBeNull();
  });
});

describe('dmCallBusy', () => {
  it('is busy from the first ring until the call has ended', () => {
    expect(dmCallBusy('idle')).toBe(false);
    expect(dmCallBusy('ended')).toBe(false);
    expect(dmCallBusy('incoming')).toBe(true);
    expect(dmCallBusy('active')).toBe(true);
  });
});
