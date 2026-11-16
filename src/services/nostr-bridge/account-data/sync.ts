import { normalizePublicRelayUrl } from '@/utils/relay-url/public-relay';
import { verifyEvent, type Event } from 'nostr-tools';
import type { BridgeImpl } from '../facade/client';
import { pageRelayHub } from '../facade/page-hub';
import { openConcordStorage } from '../concord/storage';
import { accountDataRelays } from './relays';
import { ensureChannelPrefsStoreForAccount, useChannelPrefsStore } from '@/store/chat/channel-prefs';
import { parseCommunityConnections } from '@/schemas/chat/community-connections';
import { mergeCommunityConnections, serializeCommunityConnections } from '@/utils/chat/community-connections';
import type { CommunityConnections } from '@/types/chat/community-connections';
import { KIND_NIP78_APP_DATA } from '@/constants/nostr/nip-kinds';
import { COMMUNITY_CONNECTIONS_ID, COMMUNITY_CONNECTIONS_RETRY_MS } from '@/constants/chat/community-connections';

/** Signed NIP-78, NIP-44 to self. No group traffic or account AUTH goes to these relays. */
export function startCommunityConnectionsSync(bridge: BridgeImpl) {
  const signer = bridge.getNipSigner();
  if (!signer) return () => {};
  const hub = pageRelayHub();
  const guard = bridge.captureSessionGuard();
  const identityId = `account-data:${signer.pubkey}:${bridge.getSessionGeneration()}`;
  let alive = true, applying = false, dirty = false, ready = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopRemote = () => {};
  let stopRail = () => {};
  let stopPrefs = () => {};
  let tail = Promise.resolve();
  let cacheTail = Promise.resolve();
  let doc: CommunityConnections = { version: 1, relays: {}, channels: {} };
  let lastStamp = 0, lastCreated = 0;
  let hasSnapshot = false;
  const initialStamp = Date.now();
  const assertCurrent = () => { guard(); if (!alive) throw new Error('Account sync ended'); };
  const stamp = () => lastStamp = Math.max(Date.now(), lastStamp + 1);
  const canonicalRail = (urls: string[]) => urls.flatMap(url => { const normalized = normalizePublicRelayUrl(url); return normalized ? [normalized] : []; });
  const initialRail = canonicalRail(bridge.configuredRelays.get());
  ensureChannelPrefsStoreForAccount(signer.pubkey);
  const initialPrefs = useChannelPrefsStore.getState().prefs;
  hub.setIdentity({ id: identityId, pubkey: null, signer: null, authPolicy: 'never-auth' });
  const apply = () => {
    applying = true;
    try {
      const relays = Object.entries(doc.relays).filter(([, row]) => row.value).map(([url]) => url);
      if (relays.length) bridge.restoreCommunityConnections(relays);
      useChannelPrefsStore.setState({ prefs: Object.fromEntries(Object.entries(doc.channels).flatMap(([key, row]) => row.value ? [[key, row.value]] : [])) });
    } finally { applying = false; }
  };
  void (async () => {
    const storage = await openConcordStorage(signer.pubkey, assertCurrent);
    const cached = await storage.getItem(COMMUNITY_CONNECTIONS_ID);
    if (cached) { doc = parseCommunityConnections(cached); hasSnapshot = true; apply(); }
    const relays = await accountDataRelays(bridge);
    assertCurrent();
    const save = () => {
      const snapshot = serializeCommunityConnections(doc);
      cacheTail = cacheTail.catch(() => {}).then(async () => { assertCurrent(); await storage.setItem(COMMUNITY_CONNECTIONS_ID, snapshot); });
      return cacheTail;
    };
    const ingest = async (event: Event) => {
      assertCurrent();
      if (event.pubkey !== signer.pubkey || event.kind !== KIND_NIP78_APP_DATA || !event.tags.some(tag => tag[0] === 'd' && tag[1] === COMMUNITY_CONNECTIONS_ID) || !verifyEvent(event)) return false;
      const incoming = parseCommunityConnections(await signer.nip44Decrypt(signer.pubkey, event.content));
      assertCurrent();
      hasSnapshot = true;
      lastStamp = Math.max(lastStamp, ...Object.values(incoming.relays).map(row => row.at), ...Object.values(incoming.channels).map(row => row.at));
      lastCreated = Math.max(lastCreated, event.created_at);
      const merged = mergeCommunityConnections(doc, incoming);
      if (serializeCommunityConnections(merged) !== serializeCommunityConnections(incoming)) dirty = true;
      if (serializeCommunityConnections(merged) !== serializeCommunityConnections(doc)) { doc = merged; apply(); await save(); }
      return true;
    };
    const flush = async () => {
      if (!alive || !ready || !dirty) return;
      const snapshot = serializeCommunityConnections(doc);
      // Validate the serialized byte budget before asking the signer.
      parseCommunityConnections(snapshot);
      const content = await signer.nip44Encrypt(signer.pubkey, snapshot);
      assertCurrent();
      const created_at = Math.max(Math.floor(Date.now() / 1000), lastCreated + 1);
      const event = await signer.signEvent({ kind: KIND_NIP78_APP_DATA, created_at, tags: [['d', COMMUNITY_CONNECTIONS_ID]], content });
      assertCurrent();
      const responses = await hub.publish({ relays, event, identityId, authMode: 'never' });
      assertCurrent();
      if (!responses.some(row => row.status === 'ok')) throw new Error('Account data was not accepted');
      lastCreated = created_at;
      if (snapshot === serializeCommunityConnections(doc)) dirty = false;
    };
    const schedule = (delay = 1200) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        tail = tail.then(flush).catch(() => { if (alive) schedule(COMMUNITY_CONNECTIONS_RETRY_MS); });
      }, delay);
    };
    let previousRail = new Set(canonicalRail(bridge.configuredRelays.get()));
    let previousPrefs = useChannelPrefsStore.getState().prefs;
    stopRail = bridge.configuredRelays.subscribe(next => {
      const current = new Set(canonicalRail(next));
      if (!applying) {
        const time = stamp();
        for (const url of new Set([...previousRail, ...current])) {
          if (previousRail.has(url) !== current.has(url)) { doc.relays[url] = { at: time, value: current.has(url) ? true : null }; dirty = true; }
        }
        if (dirty) { void save().catch(() => {}); schedule(); }
      }
      previousRail = current;
    });
    stopPrefs = useChannelPrefsStore.subscribe(next => {
      if (!applying) {
        const time = stamp();
        for (const key of new Set([...Object.keys(previousPrefs), ...Object.keys(next.prefs)])) {
          if (JSON.stringify(previousPrefs[key]) !== JSON.stringify(next.prefs[key])) { doc.channels[key] = { at: time, value: next.prefs[key] ?? null }; dirty = true; }
        }
        if (dirty) { void save().catch(() => {}); schedule(); }
      }
      previousPrefs = next.prefs;
    });
    const initialize = () => {
      if (!ready) return;
      if (!hasSnapshot) {
        for (const url of initialRail) doc.relays[url] ??= { at: initialStamp, value: true };
        for (const [key, value] of Object.entries(initialPrefs)) doc.channels[key] ??= { at: initialStamp, value };
        hasSnapshot = true;
        dirty = true;
      }
      apply();
      void save().catch(() => {});
      if (dirty) schedule();
    };
    const filter = { kinds: [KIND_NIP78_APP_DATA], authors: [signer.pubkey], '#d': [COMMUNITY_CONNECTIONS_ID], limit: 16 };
    const result = await hub.query({ relays, filters: [filter], identityId, maxWaitMs: 5000, cache: { mode: 'bypass' } });
    assertCurrent();
    for (const event of result.events) { try { if (await ingest(event)) ready = true; } catch { /* Ignore malformed encrypted app data. */ } }
    // Only a successful read or sealed cache can authorize publishing device defaults.
    ready ||= !!cached || Object.values(result.perRelay).includes('eose');
    initialize();
    const live = hub.subscribe({ relays, filters: [filter], identityId, priority: 'background',
      onEvent: event => { tail = tail.then(() => ingest(event)).then(valid => { if (valid) { ready = true; initialize(); } }).catch(() => {}); },
      onEose: () => { ready = true; initialize(); },
    });
    stopRemote = () => live.release();
    if (dirty) schedule();
  })().catch(() => { /* Cache remains usable when inbox discovery or private signing is unavailable. */ });
  return () => {
    alive = false; clearTimeout(timer); stopRemote(); stopRail(); stopPrefs(); hub.removeIdentity(identityId);
  };
}
