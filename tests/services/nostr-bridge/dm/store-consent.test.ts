import { describe, expect, it, vi } from 'vitest';
import { DmStoreModule } from '@/services/nostr-bridge/dm/store';

function fixture() {
  let enabled = false;
  const nipSigner = vi.fn(() => null);
  const store = new DmStoreModule({ nipSigner, replay: vi.fn(), reingest: vi.fn(), dmsEnabled: () => enabled });
  store.attach('a'.repeat(64));
  return { store, nipSigner, enable: (value: boolean) => { enabled = value; } };
}

describe('DM decryption consent', () => {
  it('blocks background wrap decryption and explicit unlock while disabled', async () => {
    const { store, nipSigner } = fixture();
    const decrypt = vi.fn();
    if (!store.defer(decrypt)) decrypt();
    await store.unlock();
    expect(decrypt).not.toHaveBeenCalled();
    expect(nipSigner).not.toHaveBeenCalled();
    expect(store.lock.get().status).toBe('locked');
  });

  it('enabling DMs alone does not authorize background decryption', () => {
    const { store, enable } = fixture();
    enable(true);
    const decrypt = vi.fn();
    expect(store.defer(decrypt)).toBe(true);
    expect(decrypt).not.toHaveBeenCalled();
  });

  it('revoking opt-in blocks even a previously unlocked store', () => {
    const { store, enable } = fixture();
    enable(true);
    store.lock.set({ status: 'unlocked', unopened: [] });
    expect(store.defer(vi.fn())).toBe(false);
    enable(false);
    expect(store.isUnlocked()).toBe(false);
    expect(store.defer(vi.fn())).toBe(true);
  });

  it('does not let a stale background subscriber decrypt after logout', () => {
    const { store, enable } = fixture();
    enable(true);
    store.attach(null);
    expect(store.defer(vi.fn())).toBe(true);
  });
});
