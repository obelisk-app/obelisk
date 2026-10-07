/**
 * The shared pieces of the read-state sync: which kind a scope caches
 * under, and the rumor parsers both halves use.
 */
import { describe, expect, it } from 'vitest';
import { KIND_GIFT_WRAP, KIND_NIP78_APP_DATA } from '@/utils/nostr/nip-kinds';
import { D_TAG_GROUPS, cacheKindFor, findInnerDTag, parsePayload } from '@/services/read-state/sync-options';
import * as relaySync from '@/services/read-state/relay-sync';
import type { Rumor } from '@/lib/nip-59';

const rumor = (content: string, tags: string[][] = []): Rumor => ({ id: 'r', kind: KIND_NIP78_APP_DATA, content, tags, created_at: 1, pubkey: 'p' });

describe('read-state sync options', () => {
  it('caches each transport under the kind it publishes', () => {
    expect(cacheKindFor('replaceable')).toBe(KIND_NIP78_APP_DATA);
    expect(cacheKindFor('giftwrap')).toBe(KIND_GIFT_WRAP);
  });

  it('reads the inner d tag and only schema-1 payloads', () => {
    expect(findInnerDTag(rumor('{}', [['d', D_TAG_GROUPS]]))).toBe(D_TAG_GROUPS);
    expect(findInnerDTag(rumor('{}'))).toBeNull();
    expect(parsePayload<{ v: number }>(rumor('{"v":1,"groups":{}}'))).toEqual({ v: 1, groups: {} });
    expect(parsePayload(rumor('{"v":2}'))).toBeNull();
    expect(parsePayload(rumor('not json'))).toBeNull();
  });

  it('keeps the d tags and watchdog reachable through relay-sync', () => {
    expect(relaySync.D_TAG_GROUPS).toBe(D_TAG_GROUPS);
    expect(relaySync.READ_STATE_WATCHDOG_MS).toBe(60_000);
    expect(relaySync.__INTERNAL.parsePayload).toBe(parsePayload);
  });
});
