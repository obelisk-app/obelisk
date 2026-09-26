import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const playNotificationSound = vi.fn<(...args: unknown[]) => string>(() => 'played');
vi.mock('./sound', () => ({ playNotificationSound: (...a: unknown[]) => playNotificationSound(...a) }));

import { __resetAlertsForTests, ALERT_FRESH_WINDOW_MS, announceIncoming } from './alert';
import { useToastStore } from '@/store/toast';
import { setPreference } from '@/lib/preferences';

const NOW = 1_800_000_000_000;
const alert = (over: Partial<Parameters<typeof announceIncoming>[0]> = {}) => ({
  kind: 'mention' as const,
  id: 'ev1',
  createdAt: NOW - 1000,
  title: 'Ana mentioned you',
  body: 'hi',
  ...over,
});

describe('announceIncoming', () => {
  const NotificationMock = vi.fn();
  beforeEach(() => {
    __resetAlertsForTests();
    playNotificationSound.mockReset();
    playNotificationSound.mockReturnValue('played');
    NotificationMock.mockReset();
    setPreference('notificationSounds', true);
    setPreference('browserNotifications', false);
    (NotificationMock as unknown as { permission: string }).permission = 'granted';
    vi.stubGlobal('Notification', NotificationMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('chimes for a fresh event, once per id', () => {
    expect(announceIncoming(alert(), NOW)).toBe(true);
    expect(announceIncoming(alert(), NOW)).toBe(false);
    expect(playNotificationSound).toHaveBeenCalledTimes(1);
    expect(playNotificationSound).toHaveBeenCalledWith('mention', NOW);
  });

  it('stays quiet for backfill older than the freshness window', () => {
    expect(announceIncoming(alert({ createdAt: NOW - ALERT_FRESH_WINDOW_MS - 1 }), NOW)).toBe(false);
    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('respects the sound preference', () => {
    setPreference('notificationSounds', false);
    announceIncoming(alert(), NOW);
    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('shows an OS notification only when enabled and the page is backgrounded', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    announceIncoming(alert({ id: 'a' }), NOW);
    expect(NotificationMock).not.toHaveBeenCalled();

    setPreference('browserNotifications', true);
    announceIncoming(alert({ id: 'b' }), NOW);
    expect(NotificationMock).toHaveBeenCalledTimes(1);
    expect(NotificationMock.mock.calls[0][0]).toBe('Ana mentioned you');
    // Our chime played, so the OS popup stays silent — no double sound.
    expect(NotificationMock.mock.calls[0][1]).toMatchObject({ body: 'hi', silent: true });

    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    announceIncoming(alert({ id: 'c' }), NOW);
    expect(NotificationMock).toHaveBeenCalledTimes(1);
  });

  it('never shows an OS notification without permission', () => {
    setPreference('browserNotifications', true);
    (NotificationMock as unknown as { permission: string }).permission = 'default';
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    announceIncoming(alert(), NOW);
    expect(NotificationMock).not.toHaveBeenCalled();
  });

  it('when our chime is blocked, the OS notification makes the sound — even in the foreground', () => {
    playNotificationSound.mockReturnValue('blocked');
    setPreference('browserNotifications', true);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    announceIncoming(alert({ id: 'blk' }), NOW);
    expect(NotificationMock).toHaveBeenCalledTimes(1);
    expect(NotificationMock.mock.calls[0][1]).toMatchObject({ silent: false });
  });

  it('when blocked and no OS notifications are possible, shows a one-time hint that enables them', async () => {
    playNotificationSound.mockReturnValue('blocked');
    useToastStore.setState({ toasts: [] });
    announceIncoming(alert({ id: 'h1' }), NOW);
    announceIncoming(alert({ id: 'h2' }), NOW);
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(NotificationMock).not.toHaveBeenCalled();

    const requestPermission = vi.fn(async () => 'granted');
    Object.assign(NotificationMock, { requestPermission });
    (NotificationMock as unknown as { permission: string }).permission = 'default';
    toasts[0].onClick!();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(requestPermission).toHaveBeenCalled();
    const { getPreferences } = await import('@/lib/preferences');
    expect(getPreferences().browserNotifications).toBe(true);
  });
});
