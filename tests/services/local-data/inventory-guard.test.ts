/**
 * Guard: nothing is stored in the browser without being in the local-data
 * inventory (`src/services/local-data/`), so Settings > Data on this device
 * can show it and remove it, and the help page stays true.
 *
 * It reads the source. Every storage key the app writes starts with
 * `obelisk` (or is the SDK's, or a legacy `chat:` key), so the scan collects
 * those literals from:
 *   - every file that touches browser storage (`localStorage`,
 *     `sessionStorage`, a Zustand `persist`, `createLocalStore`, IndexedDB,
 *     Cache Storage, `document.cookie`);
 *   - every `*_KEY` / `*_PREFIX` / `*_DB` constant anywhere in `src/`, because
 *     a key is often declared in one file and written from another.
 * Each one must belong to an inventory entry. The reverse holds too: an
 * entry that is not legacy must still be found in the source.
 *
 * A literal in a storage file that is not a key (a script id, an event
 * name) goes in NOT_STORAGE below, with the reason.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '@/i18n/hardcoded/strip';
import { LOCAL_DATA, type LocalDataEntry } from '@/services/local-data';

const SRC = join(process.cwd(), 'src');
/** The inventory itself and the message files are not storage code. */
const SKIP = /^(?:services\/local-data\/|i18n\/messages\/)/;

const STORAGE_USE = /\b(?:localStorage|sessionStorage|indexedDB|caches\.|document\.cookie|createLocalStore\b|persist\(|createEnsureForAccount\()/;
const KEY_CONSTANT = /\b(?:const|let)\s+[A-Z0-9_]*(?:KEY|KEYS|PREFIX|PREFIXES|_DB|NAMESPACE)\b[^=]*=\s*([^;]+);/g;
const LITERAL = /(['"])((?:\\.|(?!\1)[^\\\n])*)\1|`([^`]*)`/g;
/** `@nostr-wot/<pkg>:` is a key; `@nostr-wot/<pkg>` alone is an import. */
const KEY_LIKE = /^(?:obelisk|@nostr-wot\/[\w-]+:|nostr-wot-sdk|chat:lastSeen)/;

/** Literals that look like keys in storage files but are not stored. */
const NOT_STORAGE = new Set([
  'obelisk-pwa-route-guard', // layout.tsx: a <Script> id
  'obelisk-pwa-register', // layout.tsx: a <Script> id
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(?:ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(path);
  }
  return out;
}

/** The static head of a literal: a template stops at its first `${`. */
function heads(chunk: string): string[] {
  const out: string[] = [];
  for (const m of chunk.matchAll(LITERAL)) {
    const text = m[2] ?? (m[3] ?? '').split('${')[0];
    if (KEY_LIKE.test(text)) out.push(text);
    // An inline script is one template literal; its own strings are inside it.
    if (m[3] !== undefined) out.push(...heads(m[3].replace(/`/g, '')));
  }
  return out;
}

interface Found { readonly key: string; readonly file: string }

function scanAll(): Found[] {
  const found: Found[] = [];
  for (const path of walk(SRC)) {
    const file = relative(SRC, path);
    if (SKIP.test(file)) continue;
    const source = stripComments(readFileSync(path, 'utf8'));
    if (STORAGE_USE.test(source)) {
      for (const key of heads(source)) found.push({ key, file });
    }
    for (const m of source.matchAll(KEY_CONSTANT)) {
      for (const key of heads(m[1])) found.push({ key, file });
    }
    // `createEnsureForAccount('base', store)` writes `base:<pubkey>`.
    for (const m of source.matchAll(/createEnsureForAccount\(\s*'([^']+)'/g)) {
      found.push({ key: `${m[1]}:`, file });
    }
  }
  return found;
}

/**
 * A literal is covered by an exact entry with that key, or a prefix entry it
 * starts with. Cache Storage names are checked against `public/sw.js` below,
 * not here: its `obelisk-v` prefix would swallow unrelated literals.
 */
function covers(entry: LocalDataEntry, key: string): boolean {
  if (entry.area === 'cacheStorage') return false;
  if (entry.match === 'exact') return entry.key === key;
  return key.startsWith(entry.key) || entry.key === key;
}

const scanned = scanAll();
const found = scanned.filter((f) => !NOT_STORAGE.has(f.key));

describe('local-data inventory guard', () => {
  it('finds the storage code at all', () => {
    // A scan that silently matched nothing would pass every check below.
    expect(found.length).toBeGreaterThan(30);
  });

  it('keeps NOT_STORAGE to literals the scan still sees (shrink-only)', () => {
    for (const key of NOT_STORAGE) expect(scanned.some((f) => f.key === key), key).toBe(true);
  });

  it('lists every storage key the source writes', () => {
    const missing = found.filter((f) => !LOCAL_DATA.some((entry) => covers(entry, f.key)));
    expect(
      missing.map((m) => `${m.key} (${m.file})`),
      'add these to src/services/local-data/inventory-*.ts, or to NOT_STORAGE here if they are not stored',
    ).toEqual([]);
  });

  it('lists no key the source no longer has, unless it is marked legacy', () => {
    const live = LOCAL_DATA.filter((e) => !e.legacy && (e.area === 'localStorage' || e.area === 'sessionStorage'));
    const stale = live.filter((entry) => !found.some((f) => covers(entry, f.key) || f.key.startsWith(entry.key)));
    expect(stale.map((e) => e.id), 'remove them, or mark them legacy: true').toEqual([]);
  });

  it('knows every persisted Zustand store and its per-account keys', () => {
    for (const path of walk(join(SRC, 'store')).concat(walk(join(SRC, 'services')))) {
      const source = stripComments(readFileSync(path, 'utf8'));
      if (!/\bpersist\(/.test(source)) continue;
      for (const m of source.matchAll(/\bname:\s*'([^']+)'/g)) {
        expect(LOCAL_DATA.some((e) => covers(e, m[1])), `${m[1]} in ${relative(SRC, path)}`).toBe(true);
      }
      for (const m of source.matchAll(/createEnsureForAccount\(\s*'([^']+)'/g)) {
        expect(LOCAL_DATA.some((e) => e.match === 'prefix' && e.key === `${m[1]}:`), `${m[1]}:<pubkey>`).toBe(true);
      }
    }
  });

  it('lists the analytics cookies whenever a page loads Google Analytics', () => {
    const gtag = walk(SRC).some((p) => readFileSync(p, 'utf8').includes('googletagmanager.com/gtag/js'));
    const listed = LOCAL_DATA.some((e) => e.area === 'cookie' && e.key === '_ga');
    expect(listed, 'gtag.js sets _ga and _ga_<id>: list them, or drop them with the script').toBe(gtag);
  });

  it('uses IndexedDB only for the session vault and the encrypted DM store, and Cache Storage only from the service worker', () => {
    const idb = walk(SRC)
      .filter((p) => !SKIP.test(relative(SRC, p)))
      .filter((p) => /\bindexedDB\b/.test(stripComments(readFileSync(p, 'utf8'))))
      .map((p) => relative(SRC, p))
      .sort();
    expect(idb).toEqual(['lib/crypto/session-vault.ts', 'services/nostr-bridge/dm/store-db.ts']);
    // Each of them names its database in the inventory.
    for (const file of idb) {
      expect(LOCAL_DATA.some((e) => e.area === 'indexedDB' && e.source === `src/${file}`), file).toBe(true);
    }
    const sw = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');
    const version = /const CACHE_VERSION = '([^']+)'/.exec(sw)?.[1] ?? '';
    const prefixes = LOCAL_DATA.filter((e) => e.area === 'cacheStorage').map((e) => e.key);
    expect(prefixes.some((p) => version.startsWith(p)), version).toBe(true);
  });
});
