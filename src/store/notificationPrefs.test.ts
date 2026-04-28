import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useNotificationPrefsStore } from './notificationPrefs';

const PUBKEY = 'npub_me';

beforeEach(() => {
  useNotificationPrefsStore.setState({ prefs: [], hydrated: false });
  globalThis.fetch = vi.fn();
});

describe('useNotificationPrefsStore', () => {
  it('hydrate fetches and stores prefs', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ prefs: [
        { id: '1', pubkey: PUBKEY, scopeType: 'channel', scopeId: 'ch1', notifyLevel: 'nothing', mutedUntil: null },
      ] }),
    });
    await useNotificationPrefsStore.getState().hydrate();
    const s = useNotificationPrefsStore.getState();
    expect(s.hydrated).toBe(true);
    expect(s.prefs).toHaveLength(1);
  });

  it('setPref updates optimistically and rolls back on API error', async () => {
    useNotificationPrefsStore.setState({ prefs: [], hydrated: true });
    (globalThis.fetch as any).mockResolvedValue({ ok: false });

    const before = useNotificationPrefsStore.getState().prefs.length;
    await useNotificationPrefsStore.getState()
      .setPref({ type: 'channel', id: 'ch1' }, { notifyLevel: 'all' })
      .catch(() => {});
    expect(useNotificationPrefsStore.getState().prefs.length).toBe(before);
  });

  it('setPref keeps the row on success', async () => {
    useNotificationPrefsStore.setState({ prefs: [], hydrated: true });
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ pref: { id: 'srv', pubkey: PUBKEY, scopeType: 'channel', scopeId: 'ch1', notifyLevel: 'all', mutedUntil: null } }),
    });
    await useNotificationPrefsStore.getState().setPref({ type: 'channel', id: 'ch1' }, { notifyLevel: 'all' });
    const s = useNotificationPrefsStore.getState();
    expect(s.prefs).toHaveLength(1);
    expect(s.prefs[0].notifyLevel).toBe('all');
  });

  it('resetPref removes the row optimistically', async () => {
    useNotificationPrefsStore.setState({
      prefs: [{ id: '1', pubkey: PUBKEY, scopeType: 'channel', scopeId: 'ch1', notifyLevel: 'nothing', mutedUntil: null }],
      hydrated: true,
    });
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await useNotificationPrefsStore.getState().resetPref({ type: 'channel', id: 'ch1' });
    expect(useNotificationPrefsStore.getState().prefs).toHaveLength(0);
  });
});
