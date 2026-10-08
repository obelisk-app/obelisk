import { describe, expect, it, vi } from 'vitest';
import { createSessionActions } from '@/services/session/actions';
import { fakeBridge } from '@tests/support/fake-bridge';

const login = vi.fn(async (_pubkey: string) => {});

describe('session actions', () => {
  it('logout invalidates a login waiting for its code to load', async () => {
    let generation = 0;
    const bridge = fakeBridge({}, {
      getSessionGeneration: () => generation,
      logout: async () => { generation++; },
    });
    const actions = createSessionActions(bridge);
    const pending = actions.login({ method: 'nip07', pubkey: 'a'.repeat(64) });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await actions.logout();
    await rejected;
    expect(login).not.toHaveBeenCalled();
  });

  it('only the latest login intent reaches the bridge', async () => {
    login.mockClear();
    const bridge = fakeBridge({}, { loginWithNip07: login });
    const actions = createSessionActions(bridge);
    const first = actions.login({ method: 'nip07', pubkey: 'a'.repeat(64) });
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const latest = { method: 'nip07' as const, pubkey: 'b'.repeat(64) };
    await actions.login(latest);
    await rejected;
    expect(login).toHaveBeenCalledExactlyOnceWith(latest.pubkey);
  });

  it('fails explicitly if a command runs before the bridge is ready', async () => {
    await expect(createSessionActions(null).logout()).rejects.toThrow('Session is not ready');
  });
  it('rejects completion when another caller invalidates the active login', async () => {
    let generation = 0;
    let finish: () => void = () => {};
    let started: () => void = () => {};
    const began = new Promise<void>((resolve) => { started = resolve; });
    const bridge = fakeBridge({}, {
      getSessionGeneration: () => generation,
      loginWithNip07: () => { generation++; started(); return new Promise<void>((resolve) => { finish = resolve; }); },
    });
    const pending = createSessionActions(bridge).login({ method: 'nip07', pubkey: 'a'.repeat(64) });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await began;
    generation++;
    finish();
    await rejected;
  });

});
