import { describe, expect, it } from 'vitest';
import { VAULT_DB } from '@/lib/crypto/session-vault';
import { LOCALE_COOKIE } from '@/i18n';
import { D_TAG_DMS, D_TAG_GROUPS } from '@/services/read-state/sync-options';
import {
  LOCAL_DATA,
  CONFIRM_KEYS,
  LOCAL_DATA_CATEGORIES,
  categoryOfKey,
  entriesIn,
  entryForKey,
  isProfileCacheKey,
  isReadStateCacheKey,
} from '@/services/local-data';
import { translator } from '@tests/support/intl';
import { WEB_ENTRIES, sampleKey } from './support';

describe('local-data inventory', () => {
  it('gives every entry a unique id', () => {
    const ids = LOCAL_DATA.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('puts every key in exactly one entry, so each category removes only its own', () => {
    for (const entry of WEB_ENTRIES) {
      const owners = LOCAL_DATA.filter((other) => {
        if (other.area !== entry.area) return false;
        const key = sampleKey(entry);
        const hit = other.match === 'exact' ? key === other.key : key.startsWith(other.key);
        return hit && (other.when ? other.when(key) : true);
      });
      expect(owners.map((o) => o.id), sampleKey(entry)).toEqual([entry.id]);
    }
  });

  it('has at least one entry in every category, and a category for every entry', () => {
    const ids = LOCAL_DATA_CATEGORIES.map((c) => c.id);
    for (const id of ids) expect(entriesIn(id).length, id).toBeGreaterThan(0);
    for (const entry of LOCAL_DATA) expect(ids).toContain(entry.category);
  });

  it('splits the bridge cache into profiles, read positions and the rest', () => {
    const relay = 'obelisk-cache-v4/wss://public.obelisk.ar';
    const hex = 'c'.repeat(64);
    expect(categoryOfKey('localStorage', `${relay}/0/${hex}`)).toBe('profiles');
    expect(categoryOfKey('localStorage', `obelisk-cache-v4/social-profiles/0/${hex}`)).toBe('profiles');
    expect(categoryOfKey('localStorage', `obelisk-cache-v4/wss://purplepag.es/3/${hex}`)).toBe('profiles');
    expect(categoryOfKey('localStorage', `${relay}/30078/${D_TAG_GROUPS}`)).toBe('readState');
    expect(categoryOfKey('localStorage', `${relay}/1059/${D_TAG_DMS}`)).toBe('readState');
    expect(categoryOfKey('localStorage', `${relay}/39000/group-1`)).toBe('channels');
    // A d tag that contains a URL (relay branding) is still channel cache.
    expect(categoryOfKey('localStorage', `${relay}/30078/obelisk:branding:wss://public.obelisk.ar`)).toBe('channels');
    expect(isProfileCacheKey(`${relay}/9/${hex}`)).toBe(false);
    expect(isReadStateCacheKey(`${relay}/30078/obelisk:readstate:v2`)).toBe(false);
  });

  it('names the vault database, the offline caches and the language cookie the code uses', () => {
    expect(LOCAL_DATA.filter((e) => e.area === 'indexedDB').map((e) => e.key)).toEqual([VAULT_DB]);
    expect(LOCAL_DATA.filter((e) => e.area === 'cookie').map((e) => e.key)).toEqual([LOCALE_COOKIE, '_ga', '_ga_']);
    expect(entryForKey('cacheStorage', 'obelisk-v9-localized-shell-cache:static')?.category).toBe('offline');
  });

  it('owns no key it does not know', () => {
    expect(entryForKey('localStorage', 'unrelated-key')).toBeUndefined();
    expect(entryForKey('localStorage', 'obelisk-cache-v5/x')).toBeUndefined();
  });

  it('has a title, a purpose and a confirmation in all three languages', () => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      const t = translator(locale);
      for (const c of LOCAL_DATA_CATEGORIES) {
        for (const key of [c.titleKey, c.purposeKey, CONFIRM_KEYS[c.id]]) {
          expect(t(key), `${locale} ${key}`).not.toBe(key);
          expect(t(key).length).toBeGreaterThan(3);
        }
      }
    }
  });
});
