import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetPermissionPromptForTests, armNotificationPermissionPrompt } from './permission-prompt';
import { setPreference } from '@/lib/preferences';

function stubNotification(permission: NotificationPermission) {
  const requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
  vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission, requestPermission }));
  return requestPermission;
}

describe('armNotificationPermissionPrompt', () => {
  beforeEach(() => {
    __resetPermissionPromptForTests();
    setPreference('browserNotifications', true);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks on the first click — not before — and only once', () => {
    const ask = stubNotification('default');
    const disarm = armNotificationPermissionPrompt();
    expect(ask).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('pointerdown'));
    expect(ask).toHaveBeenCalledTimes(1);
    disarm();
  });

  it('a keypress counts as the gesture too', () => {
    const ask = stubNotification('default');
    armNotificationPermissionPrompt();
    window.dispatchEvent(new Event('keydown'));
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('never asks again in the same page load, even if re-armed', () => {
    const ask = stubNotification('default');
    armNotificationPermissionPrompt();
    window.dispatchEvent(new Event('pointerdown'));
    armNotificationPermissionPrompt();
    window.dispatchEvent(new Event('pointerdown'));
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it.each(['granted', 'denied'] as const)('does not ask when the browser already decided (%s)', (p) => {
    const ask = stubNotification(p);
    armNotificationPermissionPrompt();
    window.dispatchEvent(new Event('pointerdown'));
    expect(ask).not.toHaveBeenCalled();
  });

  it('does not ask when the user turned browser notifications off', () => {
    const ask = stubNotification('default');
    setPreference('browserNotifications', false);
    armNotificationPermissionPrompt();
    window.dispatchEvent(new Event('pointerdown'));
    expect(ask).not.toHaveBeenCalled();
  });

  it('disarming before any gesture means no prompt', () => {
    const ask = stubNotification('default');
    armNotificationPermissionPrompt()();
    window.dispatchEvent(new Event('pointerdown'));
    expect(ask).not.toHaveBeenCalled();
  });
});
