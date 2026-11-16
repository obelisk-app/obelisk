import { verifyEvent, type Event } from 'nostr-tools';
import type { RelayHub } from '@nostr-wot/relay/hub';
import type { ConcordStorage } from '@applesauce/concord/client';
import type { NipSigner } from '@/types/nostr/nip-signer';
import { useConcordReadStore } from '@/store/chat/concord-read';
import { parseConcordRead } from '@/schemas/chat/concord-read';
import { CONCORD_READ_ID, CONCORD_READ_RETRY_MS } from '@/constants/chat/concord-read';
import { KIND_NIP78_APP_DATA } from '@/constants/nostr/nip-kinds';

/** Account-only cursors. Never publish community coordinates in plaintext tags. */
export function startConcordReadSync(hub: RelayHub, signer: NipSigner, storage: ConcordStorage, identityId: string, relays: string[], guard: () => void) {
  let alive = true, ready = false, applying = false, dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let release = () => {};
  let stop = () => {};
  let lastCreated = 0;
  let tail = Promise.resolve();
  let cacheTail = Promise.resolve();
  const store = useConcordReadStore;
  store.getState().reset(signer.pubkey);
  const assertCurrent = () => { guard(); if (!alive) throw new Error('Read sync ended'); };
  const snapshot = () => JSON.stringify(store.getState().cursors);
  const save = () => {
    const value = snapshot();
    cacheTail = cacheTail.catch(() => {}).then(async () => { assertCurrent(); await storage.setItem(CONCORD_READ_ID, value); });
    void cacheTail.catch(() => {});
  };
  const schedule = (delay = 1200) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      tail = tail.then(async () => {
        assertCurrent();
        if (!ready || !dirty) return;
        const value = snapshot();
        parseConcordRead(value);
        const content = await signer.nip44Encrypt(signer.pubkey, value);
        assertCurrent();
        const event = await signer.signEvent({ kind: KIND_NIP78_APP_DATA, created_at: Math.max(Math.floor(Date.now() / 1000), lastCreated + 1), tags: [['d', CONCORD_READ_ID]], content });
        assertCurrent();
        const result = await hub.publish({ relays, event, identityId, authMode: 'never' });
        assertCurrent();
        if (!result.some(row => row.status === 'ok')) throw new Error('Read sync not accepted');
        lastCreated = event.created_at;
        dirty = snapshot() !== value;
        if (dirty) schedule();
      }).catch(() => { if (alive) schedule(CONCORD_READ_RETRY_MS); });
    }, delay);
  };
  const ingest = async (event: Event) => {
    assertCurrent();
    if (event.pubkey !== signer.pubkey || event.kind !== KIND_NIP78_APP_DATA || !event.tags.some(tag => tag[0] === 'd' && tag[1] === CONCORD_READ_ID) || !verifyEvent(event)) return;
    if (event.created_at > Math.floor(Date.now() / 1000) + 300) return;
    const incoming = parseConcordRead(await signer.nip44Decrypt(signer.pubkey, event.content));
    assertCurrent();
    lastCreated = Math.max(lastCreated, event.created_at);
    applying = true;
    try { store.getState().merge(signer.pubkey, incoming); } finally { applying = false; }
    // Republish a union if this device has progress missing from the remote snapshot.
    dirty ||= Object.entries(store.getState().cursors).some(([key, value]) => value > (incoming[key] ?? 0));
    ready = true; save(); if (dirty) schedule();
  };
  void (async () => {
    stop = store.subscribe((next, previous) => {
      if (next.cursors === previous.cursors || next.account !== signer.pubkey) return;
      save();
      if (!applying) { dirty = true; schedule(); }
    });
    const cached = await storage.getItem(CONCORD_READ_ID);
    assertCurrent();
    if (cached) {
      applying = true;
      try { store.getState().merge(signer.pubkey, parseConcordRead(cached)); } catch { /* Ignore damaged cache. */ } finally { applying = false; }
    }
    const filter = { kinds: [KIND_NIP78_APP_DATA], authors: [signer.pubkey], '#d': [CONCORD_READ_ID], limit: 16 };
    const result = await hub.query({ relays, filters: [filter], identityId, maxWaitMs: 5000, cache: { mode: 'bypass' } });
    assertCurrent();
    for (const event of result.events) { try { await ingest(event); } catch { /* Ignore invalid private data. */ } }
    dirty ||= Object.keys(store.getState().cursors).length > 0 && result.events.length === 0;
    ready ||= Object.values(result.perRelay).includes('eose');
    const live = hub.subscribe({ relays, filters: [filter], identityId, priority: 'background',
      onEvent: event => { tail = tail.then(() => ingest(event)).catch(() => {}); },
      onEose: () => { ready = true; if (dirty) schedule(); },
    });
    release = () => live.release();
    if (dirty) schedule();
  })().catch(() => {});
  return () => { alive = false; clearTimeout(timer); release(); stop(); if (store.getState().account === signer.pubkey) store.getState().reset(null); };
}
