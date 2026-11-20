import { LOCAL_READ_CURSOR_DB } from '@/constants/read-state/sync-options';
import { openStore, putRecord } from '@/lib/crypto/vault-idb';
import { waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, expect, it, vi } from 'vitest';
import { hydrateLocalCursors, startLocalCursorSync } from '@/services/read-state/local-cursors';
import { ensureReadStateStoreForAccount, useReadStateStore } from '@/store/read-state';
import { relayChannelKey } from '@/utils/chat/channel/relay-channel-key';

afterEach(() => {
  useReadStateStore.getState().reset();
  ensureReadStateStoreForAccount(null);
  vi.unstubAllGlobals();
});

it('recovers both cursor advances when two tab lifetimes write from stale in-memory state', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('BroadcastChannel', undefined);
  const first = relayChannelKey('wss://first.test', 'general');
  const second = relayChannelKey('wss://second.test', 'general');

  ensureReadStateStoreForAccount('reader');
  const stopFirst = startLocalCursorSync('reader');
  useReadStateStore.getState().setGroupCursor(first, 200);
  stopFirst();

  useReadStateStore.getState().reset();
  const stopSecond = startLocalCursorSync('reader');
  try {
    useReadStateStore.getState().setGroupCursor(second, 300);
    await waitFor(() => {
      expect(useReadStateStore.getState().groupCursors).toEqual({ [first]: 200, [second]: 300 });
    });
  } finally {
    stopSecond();
  }

  ensureReadStateStoreForAccount('other-account');
  const stopOther = startLocalCursorSync('other-account');
  try {
    useReadStateStore.getState().setDmCursor('some-peer', 123);
    await waitFor(() => expect(useReadStateStore.getState().dmCursors['some-peer']).toBe(123));
    expect(useReadStateStore.getState().groupCursors).toEqual({});
  } finally {
    stopOther();
  }
});

it('updates another tab from the committed database without waiting for a relay', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  const owner = 'same-browser';
  ensureReadStateStoreForAccount(owner);
  const sender = new BroadcastChannel(`${LOCAL_READ_CURSOR_DB}:${owner}`);
  const stop = startLocalCursorSync(owner);
  const key = relayChannelKey('wss://first.test', 'general');
  try {
    const db = await openStore(indexedDB, LOCAL_READ_CURSOR_DB, 'accounts');
    try {
      await putRecord(db, 'accounts', owner, { groupCursors: { [key]: 325 } });
    } finally {
      db.close();
    }
    sender.postMessage('updated');
    await waitFor(() => expect(useReadStateStore.getState().groupCursors[key]).toBe(325));
  } finally {
    stop();
    sender.close();
  }
});

it('ignores another account hydrating before the old tab listener is disposed', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('BroadcastChannel', undefined);
  ensureReadStateStoreForAccount('prior-account');
  const stop = startLocalCursorSync('prior-account');
  ensureReadStateStoreForAccount('replacement-account');
  useReadStateStore.getState().setDmCursor('replacement-peer', 100);
  stop();

  ensureReadStateStoreForAccount('prior-account');
  await hydrateLocalCursors('prior-account', () => {});
  expect(useReadStateStore.getState().dmCursors['replacement-peer']).toBeUndefined();
});
