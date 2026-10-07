import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchNotificationPermission } from '@/services/settings/notification-permission';

afterEach(() => vi.unstubAllGlobals());

describe('watchNotificationPermission', () => {
  it('reports now, on focus and on the permission change event, until unsubscribed', async () => {
    const N = { permission: 'default' };
    vi.stubGlobal('Notification', N);
    const status = { onchange: null as null | (() => void) };
    vi.stubGlobal('navigator', { ...navigator, permissions: { query: vi.fn(async () => status) } });
    const seen: string[] = [];
    const stop = watchNotificationPermission((p) => seen.push(p));
    expect(seen).toEqual(['default']);
    N.permission = 'granted';
    window.dispatchEvent(new Event('focus'));
    expect(seen).toEqual(['default', 'granted']);
    await vi.waitFor(() => expect(status.onchange).not.toBeNull());
    N.permission = 'denied';
    status.onchange!();
    expect(seen.at(-1)).toBe('denied');
    stop();
    expect(status.onchange).toBeNull();
    window.dispatchEvent(new Event('focus'));
    expect(seen).toHaveLength(3);
  });

  it('is unsupported without the Notification API, and survives a browser without permissions.query', () => {
    vi.stubGlobal('Notification', undefined);
    vi.stubGlobal('navigator', { ...navigator, permissions: undefined });
    const onPermission = vi.fn();
    watchNotificationPermission(onPermission)();
    expect(onPermission).toHaveBeenCalledWith('unsupported');
  });
});
