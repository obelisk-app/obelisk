import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readPermission, requestPermission, isSoftPromptEligible } from './permission';

const SESSION_START = 1_700_000_000_000;
const ONE_MIN_LATER = SESSION_START + 60_000;

beforeEach(() => {
  // jsdom does not implement Notification — provide a controllable stub.
  (globalThis as any).Notification = {
    permission: 'default' as NotificationPermission,
    requestPermission: vi.fn().mockResolvedValue('granted' as NotificationPermission),
  };
  globalThis.localStorage.clear();
});

describe('readPermission', () => {
  it('returns "unsupported" when Notification is missing', () => {
    delete (globalThis as any).Notification;
    expect(readPermission()).toBe('unsupported');
  });

  it('returns the current Notification.permission', () => {
    (globalThis as any).Notification.permission = 'granted';
    expect(readPermission()).toBe('granted');
  });
});

describe('requestPermission', () => {
  it('calls Notification.requestPermission and returns the result', async () => {
    const result = await requestPermission();
    expect((globalThis as any).Notification.requestPermission).toHaveBeenCalled();
    expect(result).toBe('granted');
  });

  it('returns "unsupported" when Notification is missing', async () => {
    delete (globalThis as any).Notification;
    expect(await requestPermission()).toBe('unsupported');
  });
});

describe('isSoftPromptEligible', () => {
  it('eligible when permission=default, ≥60s, not dismissed', () => {
    expect(isSoftPromptEligible({
      permission: 'default',
      sessionStartedAt: SESSION_START,
      now: ONE_MIN_LATER,
      sessionDismissed: false,
      permanentlyDismissed: false,
    })).toBe(true);
  });

  it('not eligible before 60s', () => {
    expect(isSoftPromptEligible({
      permission: 'default',
      sessionStartedAt: SESSION_START,
      now: SESSION_START + 30_000,
      sessionDismissed: false,
      permanentlyDismissed: false,
    })).toBe(false);
  });

  it('not eligible when permission=granted', () => {
    expect(isSoftPromptEligible({
      permission: 'granted',
      sessionStartedAt: SESSION_START,
      now: ONE_MIN_LATER,
      sessionDismissed: false,
      permanentlyDismissed: false,
    })).toBe(false);
  });

  it('not eligible when permission=denied', () => {
    expect(isSoftPromptEligible({
      permission: 'denied',
      sessionStartedAt: SESSION_START,
      now: ONE_MIN_LATER,
      sessionDismissed: false,
      permanentlyDismissed: false,
    })).toBe(false);
  });

  it('not eligible when session-dismissed', () => {
    expect(isSoftPromptEligible({
      permission: 'default',
      sessionStartedAt: SESSION_START,
      now: ONE_MIN_LATER,
      sessionDismissed: true,
      permanentlyDismissed: false,
    })).toBe(false);
  });

  it('not eligible when permanently dismissed', () => {
    expect(isSoftPromptEligible({
      permission: 'default',
      sessionStartedAt: SESSION_START,
      now: ONE_MIN_LATER,
      sessionDismissed: false,
      permanentlyDismissed: true,
    })).toBe(false);
  });
});
