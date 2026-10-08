import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { OwnProfileModule, type OwnProfileContext } from '@/services/nostr-bridge/profile/profile-own';
import { StateStore } from '@/services/nostr-bridge/common/state-store';
import type { PersistedSession } from '@/services/nostr-bridge/session/session-storage';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function setup() {
  const initial: PersistedSession = { pubKeyHex: 'a'.repeat(64), loginMethod: 'nip07', relayUrl: 'wss://relay.example.com' };
  const account = { session: initial as PersistedSession | null };
  const query = deferred<{ events: NostrEvent[]; complete: boolean }>();
  const signAndPublish = vi.fn(async () => ({ pubkey: 'b'.repeat(64), kind: 0, created_at: 1, content: '{}', tags: [], id: '1'.repeat(64), sig: '1'.repeat(128) }));
  const ctx: OwnProfileContext = {
    session: () => account.session,
    relays: () => [initial.relayUrl],
    currentRelayUrl: new StateStore(initial.relayUrl),
    queryRelaysWithConfidence: () => query.promise,
    signAndPublish,
  };
  const deps = { ingest: vi.fn(), ingestRelayScoped: vi.fn(), lookupRelays: () => [], publishSignedEventToRelays: vi.fn(async () => []) };
  return { profile: new OwnProfileModule(ctx, deps), account, query, signAndPublish, deps };
}

beforeEach(() => localStorage.clear());

describe('own profile account ownership', () => {
  it.each(['switch', 'same-key-relogin'] as const)('does not sign an edit after %s during its lookup', async (change) => {
    const { profile, account, query, signAndPublish } = setup();
    const result = profile.edit({ name: 'Old account name' }).catch((error: Error) => error.name);
    account.session = { ...account.session!, pubKeyHex: (change === 'switch' ? 'b' : 'a').repeat(64) };
    query.resolve({ events: [], complete: true });
    expect(await result).toBe('AbortError');
    expect(signAndPublish).not.toHaveBeenCalled();
  });

  it('does not sync an old account profile after logout during lookup', async () => {
    const { profile, account, query, deps } = setup();
    const syncing = profile.sync('manual');
    account.session = null;
    query.resolve({ events: [{ pubkey: 'a'.repeat(64), kind: 0, created_at: 1, content: '{}', tags: [], id: '1'.repeat(64), sig: '1'.repeat(128) }], complete: true });
    await syncing;
    expect(deps.ingest).not.toHaveBeenCalled();
    expect(deps.publishSignedEventToRelays).not.toHaveBeenCalled();
  });
  it('honors the action generation guard even before a replacement login installs credentials', async () => {
    const { profile, query, signAndPublish } = setup();
    let current = true;
    const result = profile.edit({ name: 'Old account name' }, { assertCurrent: () => {
      if (!current) throw new DOMException('Replaced', 'AbortError');
    } }).catch((error: Error) => error.name);
    current = false;
    query.resolve({ events: [], complete: true });
    expect(await result).toBe('AbortError');
    expect(signAndPublish).not.toHaveBeenCalled();
  });

});
