import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestNotificationPermission, showBrowserNotification } from './browser-notifications';

describe('browser-notifications', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('requestNotificationPermission', () => {
    it('returns true when already granted', async () => {
      Object.defineProperty(window, 'Notification', {
        value: { permission: 'granted', requestPermission: vi.fn() },
        writable: true,
        configurable: true,
      });
      expect(await requestNotificationPermission()).toBe(true);
    });

    it('returns false when denied', async () => {
      Object.defineProperty(window, 'Notification', {
        value: { permission: 'denied', requestPermission: vi.fn() },
        writable: true,
        configurable: true,
      });
      expect(await requestNotificationPermission()).toBe(false);
    });

    it('requests permission when default', async () => {
      const requestPermission = vi.fn().mockResolvedValue('granted');
      Object.defineProperty(window, 'Notification', {
        value: { permission: 'default', requestPermission },
        writable: true,
        configurable: true,
      });
      expect(await requestNotificationPermission()).toBe(true);
      expect(requestPermission).toHaveBeenCalled();
    });
  });

  describe('showBrowserNotification', () => {
    it('creates a notification when granted', () => {
      const mockNotification = vi.fn();
      Object.defineProperty(window, 'Notification', {
        value: Object.assign(mockNotification, { permission: 'granted' }),
        writable: true,
        configurable: true,
      });

      showBrowserNotification('Test', 'Body');
      expect(mockNotification).toHaveBeenCalledWith('Test', expect.objectContaining({ body: 'Body' }));
    });

    it('does nothing when not granted', () => {
      const mockNotification = vi.fn();
      Object.defineProperty(window, 'Notification', {
        value: Object.assign(mockNotification, { permission: 'denied' }),
        writable: true,
        configurable: true,
      });

      showBrowserNotification('Test', 'Body');
      expect(mockNotification).not.toHaveBeenCalled();
    });
  });
});
