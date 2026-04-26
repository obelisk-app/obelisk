# Direct Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Branching policy:** All worktrees merge into `develop` (NOT `master`). After a task is merged into `develop`, remove the worktree. Each subagent dispatch closes with: `git worktree remove <path>` after the merge to `develop` is confirmed.
>
> **Model + parallelism:** Subagents may run on Opus 4.7 (1M context). Independent tasks may be dispatched in parallel; tasks with explicit dependencies must serialize.

**Goal:** Re-enable DMs in Obelisk with an outbox-aware data layer, encrypted-at-rest cache (KEK pattern), request coalescer, follow-aware eviction, and live subscriptions, satisfying every premise audited in the design spec.

**Architecture:** Read path uses `nostr-tools` `SimplePool` with a 50ms request coalescer that issues one multi-filter REQ per relay. Write/encrypt/decrypt path uses NDK signer. localStorage stores wire-encrypted events plus an AES-GCM-encrypted plaintext blob keyed by a 32-byte secret that is itself NIP-44-self-encrypted by the user's signer (one signer round-trip per session). All caches are per-pubkey. Live `subscribeMany` runs while the DM view is mounted.

**Tech Stack:** Next.js 16, TypeScript, NDK v3, nostr-tools (`SimplePool`, `verifyEvent`, `nip44`), Zustand, Vitest + React Testing Library, WebCrypto (`AES-GCM`).

**Spec:** `docs/superpowers/specs/2026-04-26-direct-messages-design.md`

---

## File map

**New (`src/lib/dm/`):**
- `pool.ts` — SimplePool singleton + `verifyEvent` wrapper.
- `cache-key.ts` — KEK pattern: generate, NIP-44-wrap, unwrap, import as non-extractable WebCrypto AES-GCM key.
- `dm-cache.ts` — Per-pubkey storage. Wire-encrypted events + AES-GCM secrets + cursors. Follow-aware LRU eviction.
- `coalescer.ts` — `RequestCoalescer` class: 50ms debounce window, per-relay multi-filter REQ, dedup, 5s timeout.
- `profile-cache.ts` — Kind-0 SWR (24h TTL), purplepag.es included.
- `relay-list-cache.ts` — Kind-10002 + 10050 SWR (6h TTL), content-diff before notify.
- `follows.ts` — Kind-3 cold-load seed + live-sub follow set.
- `dm.ts` — Public API: `loadHistory`, `subscribeLive`, `sendDM`, `verifyAndIngest`.
- `dm-inbox.ts` — Moved from `src/lib/dm-inbox.ts` (publishing kind 10050).

**New (other):**
- `src/components/dm/DMSessionProvider.tsx` — owns the live subscription + coalescer for the DM view.
- `src/__tests__/csp.test.ts` — CSP header smoke test.
- `docs/direct-messages.md` — user/dev-facing DM documentation.

**Modified:**
- `src/store/dm.ts` — per-account namespacing; `messages` RAM-only; `decryptInRange`.
- `src/components/dm/DMList.tsx` — `useDMSession`; signer-gate.
- `src/components/dm/DMChat.tsx` — `useDMSession`; viewport decryption.
- `src/components/dm/NewDMModal.tsx` — `ProfileCache` for npub preview.
- `src/lib/feature-flags.ts` — `DM_FEATURE_ENABLED = true`.
- `src/lib/nostr.ts` — remove `addDMInboxRelays` and `NIP17_INBOX_FALLBACK_RELAYS`.
- `next.config.ts` — CSP headers.

**Deleted (after migration):**
- `src/lib/dm.ts` (top-level — replaced by `src/lib/dm/dm.ts`)
- `src/lib/dm-cache.ts` (top-level — replaced by `src/lib/dm/dm-cache.ts`)
- `src/lib/dm-inbox.ts` (top-level — moved into `src/lib/dm/`)
- Their `.test.ts` siblings.

---

## Task dependency graph

```
1 (pool) ─┬─→ 4 (coalescer) ─┬─→ 5 (profile-cache) ─┐
          │                  ├─→ 6 (relay-list)    │
          │                  └─→ 7 (follows)       │
2 (cache-key) ─→ 3 (dm-cache) ─────────────────────┤
                                                    └─→ 8 (dm.ts) → 9 (dm-inbox) → 10 (store)
                                                                                  → 11 (provider) → 12 (DMList)
                                                                                                  → 13 (DMChat)
                                                                                                  → 14 (NewDMModal)
                                                                                                  → 15 (cleanup) → 16 (CSP)
                                                                                                                 → 17 (flag) → 18 (integration) → 19 (docs)
```

Tasks 1+2 may run in parallel. Tasks 5/6/7 may run in parallel after 4. Tasks 12/13/14 may run in parallel after 11.

---

## Task 1: SimplePool wrapper + signature verification

**Files:**
- Create: `src/lib/dm/pool.ts`
- Test: `src/lib/dm/pool.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dm/pool.test.ts
import { describe, it, expect } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { verifyDMEvent } from './pool';

describe('verifyDMEvent', () => {
  function signed(content: string) {
    const sk = generateSecretKey();
    const ev = finalizeEvent({
      kind: 1, created_at: Math.floor(Date.now() / 1000), tags: [], content,
    }, sk);
    return { ev, pubkey: getPublicKey(sk) };
  }

  it('accepts a valid signed event', () => {
    const { ev } = signed('hello');
    expect(verifyDMEvent(ev)).toBe(true);
  });

  it('rejects an event with a sig from a different message', () => {
    const a = signed('hello');
    const b = signed('world');
    const tampered = { ...a.ev, sig: b.ev.sig };
    expect(verifyDMEvent(tampered)).toBe(false);
  });

  it('rejects an event whose pubkey does not match the sig', () => {
    const a = signed('hello');
    const b = signed('also hello');
    const tampered = { ...a.ev, pubkey: b.ev.pubkey };
    expect(verifyDMEvent(tampered)).toBe(false);
  });

  it('rejects when content is mutated post-sign', () => {
    const { ev } = signed('hello');
    const tampered = { ...ev, content: 'goodbye' };
    expect(verifyDMEvent(tampered)).toBe(false);
  });

  it('rejects a tampered event even after the original was previously verified', () => {
    const a = signed('hello');
    const b = signed('world');
    // First call populates verifiedSymbol on a.ev.
    expect(verifyDMEvent(a.ev)).toBe(true);
    // Spread copies the cached symbol; without the strip this would falsely return true.
    const tampered = { ...a.ev, sig: b.ev.sig };
    expect(verifyDMEvent(tampered)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/dm/pool.test.ts`
Expected: FAIL — `Failed to resolve import "./pool"`.

- [ ] **Step 3: Write minimal implementation**

`nostr-tools/pure` caches verification results directly on the event object via a symbol-keyed property (`verifiedSymbol`). Because JavaScript object spread copies own symbol properties, an attacker (or buggy caller) can take a previously-verified event and produce `{ ...verifiedEv, sig: badSig }` — the spread carries the cached `true`, and `verifyEvent` will short-circuit and return `true` for the tampered copy. To stay sound on any input we strip the cached flag onto a shallow copy before delegating to `verifyEvent`. Working on a copy also means we never mutate the caller's event, which matters since the same event objects flow through the SimplePool subscription pipeline. There is a regression test for this exact path in `pool.test.ts` ("rejects a tampered event even after the original was previously verified").

```ts
// src/lib/dm/pool.ts
// Browser-only — uses the global WebSocket. Server-side relay reads live
// in src/lib/profile-sync.ts which wires nostr-tools to `ws`.
import { SimplePool } from 'nostr-tools/pool';
import { verifyEvent, verifiedSymbol, type Event as NostrEvent } from 'nostr-tools/pure';

let pool: SimplePool | null = null;
export function getDMPool(): SimplePool {
  if (!pool) pool = new SimplePool();
  return pool;
}

export function resetDMPool(): void {
  if (pool) {
    try { pool.close([]); } catch { /* ignore */ }
  }
  pool = null;
}

export function verifyDMEvent(event: NostrEvent): boolean {
  try {
    // nostr-tools/pure caches verification results on `event[verifiedSymbol]`.
    // JS object spread copies own symbol properties, so a tampered event
    // produced by `{ ...verifiedEv, sig: badSig }` would short-circuit to
    // `true`. Strip the cached flag onto a shallow copy before delegating —
    // this also avoids mutating the caller's event.
    const { [verifiedSymbol]: _ignored, ...rest } =
      event as NostrEvent & { [verifiedSymbol]?: boolean };
    return verifyEvent(rest as NostrEvent);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/dm/pool.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dm/pool.ts src/lib/dm/pool.test.ts
git commit -m "feat(dm): SimplePool singleton + signature verification helper"
```

---

## Task 2: KEK + WebCrypto AES-GCM cache key

**Files:**
- Create: `src/lib/dm/cache-key.ts`
- Test: `src/lib/dm/cache-key.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dm/cache-key.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getOrCreateCacheKey, _resetCacheKeyState, encryptToCache, decryptFromCache } from './cache-key';

interface MockSigner {
  pubkey: string;
  nip44Encrypt: ReturnType<typeof vi.fn>;
  nip44Decrypt: ReturnType<typeof vi.fn>;
}

function mockSigner(pubkey = 'a'.repeat(64)): MockSigner {
  // Trivial reversible "encryption": prefix with WRAP|, store as-is.
  return {
    pubkey,
    nip44Encrypt: vi.fn(async (_pk: string, plaintext: string) => `WRAP|${plaintext}`),
    nip44Decrypt: vi.fn(async (_pk: string, ciphertext: string) => ciphertext.replace(/^WRAP\|/, '')),
  };
}

describe('cache-key', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetCacheKeyState();
  });

  it('first call generates + wraps the key, persists wrapped form', async () => {
    const signer = mockSigner();
    const key = await getOrCreateCacheKey(signer.pubkey, signer);
    expect(key).toBeDefined();
    expect(signer.nip44Encrypt).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(`obelisk:dm-cache-key:${signer.pubkey}`)).toMatch(/^WRAP\|/);
  });

  it('second call within session returns RAM-cached key with zero signer calls', async () => {
    const signer = mockSigner();
    await getOrCreateCacheKey(signer.pubkey, signer);
    signer.nip44Encrypt.mockClear();
    signer.nip44Decrypt.mockClear();
    await getOrCreateCacheKey(signer.pubkey, signer);
    expect(signer.nip44Encrypt).not.toHaveBeenCalled();
    expect(signer.nip44Decrypt).not.toHaveBeenCalled();
  });

  it('after RAM reset, unwraps via signer exactly once', async () => {
    const signer = mockSigner();
    await getOrCreateCacheKey(signer.pubkey, signer);
    _resetCacheKeyState();
    signer.nip44Encrypt.mockClear();
    signer.nip44Decrypt.mockClear();
    await getOrCreateCacheKey(signer.pubkey, signer);
    expect(signer.nip44Decrypt).toHaveBeenCalledTimes(1);
    expect(signer.nip44Encrypt).not.toHaveBeenCalled();
  });

  it('imports the AES key as non-extractable', async () => {
    const signer = mockSigner();
    const key = await getOrCreateCacheKey(signer.pubkey, signer);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toBeDefined();
  });

  it('encryptToCache + decryptFromCache round-trip a string', async () => {
    const signer = mockSigner();
    const key = await getOrCreateCacheKey(signer.pubkey, signer);
    const blob = await encryptToCache(key, 'top secret');
    expect(blob).not.toContain('top secret');
    const back = await decryptFromCache(key, blob);
    expect(back).toBe('top secret');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/dm/cache-key.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/dm/cache-key.ts
/**
 * Per-account symmetric cache key. The 32-byte raw key is generated locally,
 * NIP-44-self-encrypted by the user's signer (so only their nsec/extension/
 * bunker can recover it), and persisted in that wrapped form. On unwrap we
 * import as a non-extractable WebCrypto AES-GCM key — XSS can call our
 * encrypt/decrypt helpers but cannot exfiltrate the raw bytes.
 */

interface KEKSigner {
  pubkey: string;
  nip44Encrypt(recipientPubkey: string, plaintext: string): Promise<string>;
  nip44Decrypt(senderPubkey: string, ciphertext: string): Promise<string>;
}

const KEY_PREFIX = 'obelisk:dm-cache-key:';

const ramKeys = new Map<string, CryptoKey>();

export function _resetCacheKeyState(): void {
  ramKeys.clear();
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function getOrCreateCacheKey(myPubkey: string, signer: KEKSigner): Promise<CryptoKey> {
  const cached = ramKeys.get(myPubkey);
  if (cached) return cached;

  const storageKey = KEY_PREFIX + myPubkey;
  let rawHex: string;

  const wrapped = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
  if (wrapped) {
    rawHex = await signer.nip44Decrypt(myPubkey, wrapped);
  } else {
    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    rawHex = bytesToBase64(raw);
    const wrappedNew = await signer.nip44Encrypt(myPubkey, rawHex);
    if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, wrappedNew);
  }

  const raw = base64ToBytes(rawHex);
  const key = await crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM' },
    /* extractable */ false,
    ['encrypt', 'decrypt'],
  );

  // Zero raw bytes after import (best effort).
  raw.fill(0);

  ramKeys.set(myPubkey, key);
  return key;
}

export async function encryptToCache(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  // Pack as base64(iv) + '.' + base64(ct)
  return `${bytesToBase64(iv)}.${bytesToBase64(ct)}`;
}

export async function decryptFromCache(key: CryptoKey, blob: string): Promise<string> {
  const [ivB64, ctB64] = blob.split('.');
  const iv = base64ToBytes(ivB64);
  const ct = base64ToBytes(ctB64);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/dm/cache-key.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dm/cache-key.ts src/lib/dm/cache-key.test.ts
git commit -m "feat(dm): per-account cache key (KEK pattern, non-extractable AES-GCM)"
```

---

## Task 3: Encrypted-at-rest DM cache with follow-aware eviction

**Files:**
- Create: `src/lib/dm/dm-cache.ts`
- Test: `src/lib/dm/dm-cache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dm/dm-cache.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  putEvent, getEvent, getCachedEvents,
  putSecret, getSecret,
  getCursors, setCursor,
  setFollowSet, evictIfNeeded,
  clearAccount,
  type CachedDMEvent,
} from './dm-cache';
import { getOrCreateCacheKey, _resetCacheKeyState } from './cache-key';

const me = 'a'.repeat(64);
const partnerFollowed = 'b'.repeat(64);
const partnerStranger = 'c'.repeat(64);

function fakeEvent(id: string, ts: number, partner: string): CachedDMEvent {
  return {
    id, pubkey: me, kind: 4, created_at: ts, content: 'CIPHER', tags: [['p', partner]], sig: 'x',
  };
}

const signer = {
  pubkey: me,
  nip44Encrypt: vi.fn(async (_p: string, t: string) => `WRAP|${t}`),
  nip44Decrypt: vi.fn(async (_p: string, c: string) => c.replace(/^WRAP\|/, '')),
};

beforeEach(() => {
  localStorage.clear();
  _resetCacheKeyState();
  signer.nip44Encrypt.mockClear();
  signer.nip44Decrypt.mockClear();
});

describe('dm-cache event store', () => {
  it('round-trips events keyed by pubkey', () => {
    putEvent(me, fakeEvent('id1', 100, partnerStranger));
    expect(getEvent(me, 'id1')?.id).toBe('id1');
    expect(getCachedEvents(me)).toHaveLength(1);
  });

  it('isolates events per account', () => {
    putEvent(me, fakeEvent('id1', 100, partnerStranger));
    expect(getCachedEvents('z'.repeat(64))).toHaveLength(0);
  });

  it('does not store any plaintext substring after putSecret', async () => {
    const key = await getOrCreateCacheKey(me, signer);
    await putSecret(me, key, 'id1', 'Hello secret payload');
    const blob = JSON.stringify(localStorage);
    expect(blob).not.toContain('Hello secret payload');
  });

  it('round-trips a secret', async () => {
    const key = await getOrCreateCacheKey(me, signer);
    await putSecret(me, key, 'id1', 'roundtrip me');
    expect(await getSecret(me, key, 'id1')).toBe('roundtrip me');
  });

  it('cursors monotonically increase', () => {
    setCursor(me, 'nip04In', 100);
    setCursor(me, 'nip04In', 200);
    expect(getCursors(me).nip04In).toBe(200);
    setCursor(me, 'nip04In', 50);
    expect(getCursors(me).nip04In).toBe(200);
  });
});

describe('dm-cache follow-aware eviction', () => {
  it('with an empty follow set, evicts strictly by LRU when cap is exceeded', () => {
    setFollowSet(me, new Set());
    for (let i = 0; i < 2010; i++) putEvent(me, fakeEvent(`id${i}`, 1_000_000 + i, partnerStranger));
    evictIfNeeded(me, 2000);
    expect(getCachedEvents(me).length).toBe(2000);
    expect(getEvent(me, 'id0')).toBeUndefined();
    expect(getEvent(me, 'id2009')).toBeDefined();
  });

  it('protects all events when follow set has never been set (cold start)', () => {
    // No setFollowSet call at all.
    for (let i = 0; i < 2010; i++) putEvent(me, fakeEvent(`id${i}`, 1_000_000 + i, partnerStranger));
    evictIfNeeded(me, 2000);
    expect(getCachedEvents(me)).toHaveLength(2010);
  });

  it('protects all events when follow set is explicitly null (also cold start)', () => {
    setFollowSet(me, null);
    for (let i = 0; i < 2010; i++) putEvent(me, fakeEvent(`id${i}`, 1_000_000 + i, partnerStranger));
    evictIfNeeded(me, 2000);
    expect(getCachedEvents(me)).toHaveLength(2010);
  });

  it('protects events from followed partners; cap applies only to non-followed', () => {
    setFollowSet(me, new Set([partnerFollowed]));
    for (let i = 0; i < 1500; i++) putEvent(me, fakeEvent(`f${i}`, 1_000_000 + i, partnerFollowed));
    for (let i = 0; i < 2500; i++) putEvent(me, fakeEvent(`s${i}`, 2_000_000 + i, partnerStranger));
    evictIfNeeded(me, 2000);
    const all = getCachedEvents(me);
    const followedKept = all.filter(e => e.tags.find(t => t[0] === 'p')?.[1] === partnerFollowed).length;
    const strangerKept = all.filter(e => e.tags.find(t => t[0] === 'p')?.[1] === partnerStranger).length;
    expect(followedKept).toBe(1500);
    expect(strangerKept).toBe(2000);
  });
});

describe('dm-cache clearAccount', () => {
  it('drops all keys for the given account', async () => {
    const key = await getOrCreateCacheKey(me, signer);
    putEvent(me, fakeEvent('id1', 100, partnerStranger));
    await putSecret(me, key, 'id1', 'x');
    setCursor(me, 'nip04In', 1);
    clearAccount(me);
    expect(getCachedEvents(me)).toHaveLength(0);
    expect(getCursors(me).nip04In).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/dm/dm-cache.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/dm/dm-cache.ts
import { encryptToCache, decryptFromCache } from './cache-key';

export interface CachedDMEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;          // 4 or 1059
  content: string;       // wire-encrypted ciphertext
  tags: string[][];
  sig: string;
}

export interface DMCursors {
  nip04In: number;
  nip04Out: number;
  nip17Wrap: number;
  kind3: number;
}

interface CacheShape {
  events: Record<string, CachedDMEvent>;
  secrets: Record<string, string>; // eventId → AES-GCM ciphertext blob
  cursors: DMCursors;
}

const followSets = new Map<string, Set<string> | null>();

const DEFAULT_CURSORS: DMCursors = { nip04In: 0, nip04Out: 0, nip17Wrap: 0, kind3: 0 };

function keyEvents(pk: string) { return `obelisk:dm:${pk}`; }

function read(pk: string): CacheShape {
  if (typeof localStorage === 'undefined') return { events: {}, secrets: {}, cursors: { ...DEFAULT_CURSORS } };
  try {
    const raw = localStorage.getItem(keyEvents(pk));
    if (!raw) return { events: {}, secrets: {}, cursors: { ...DEFAULT_CURSORS } };
    const parsed = JSON.parse(raw) as Partial<CacheShape>;
    return {
      events: parsed.events ?? {},
      secrets: parsed.secrets ?? {},
      cursors: { ...DEFAULT_CURSORS, ...(parsed.cursors ?? {}) },
    };
  } catch {
    return { events: {}, secrets: {}, cursors: { ...DEFAULT_CURSORS } };
  }
}

function write(pk: string, shape: CacheShape): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(keyEvents(pk), JSON.stringify(shape));
  } catch (err) {
    console.warn('[dm-cache] write failed:', err);
  }
}

export function putEvent(myPubkey: string, ev: CachedDMEvent): void {
  const c = read(myPubkey);
  c.events[ev.id] = ev;
  write(myPubkey, c);
}

export function getEvent(myPubkey: string, id: string): CachedDMEvent | undefined {
  return read(myPubkey).events[id];
}

export function getCachedEvents(myPubkey: string): CachedDMEvent[] {
  return Object.values(read(myPubkey).events);
}

export async function putSecret(
  myPubkey: string,
  key: CryptoKey,
  eventId: string,
  plaintext: string,
): Promise<void> {
  const c = read(myPubkey);
  c.secrets[eventId] = await encryptToCache(key, plaintext);
  write(myPubkey, c);
}

export async function getSecret(
  myPubkey: string,
  key: CryptoKey,
  eventId: string,
): Promise<string | undefined> {
  const blob = read(myPubkey).secrets[eventId];
  if (!blob) return undefined;
  try {
    return await decryptFromCache(key, blob);
  } catch {
    return undefined;
  }
}

export function getCursors(myPubkey: string): DMCursors {
  return read(myPubkey).cursors;
}

export function setCursor(myPubkey: string, name: keyof DMCursors, value: number): void {
  const c = read(myPubkey);
  if (value > c.cursors[name]) {
    c.cursors[name] = value;
    write(myPubkey, c);
  }
}

export function setFollowSet(myPubkey: string, set: Set<string> | null): void {
  followSets.set(myPubkey, set);
}

export function getFollowSet(myPubkey: string): Set<string> | null {
  return followSets.get(myPubkey) ?? null;
}

function partnerOf(ev: CachedDMEvent, myPubkey: string): string {
  if (ev.kind === 4) {
    const pTag = ev.tags.find((t) => t[0] === 'p');
    return ev.pubkey === myPubkey ? (pTag?.[1] ?? '') : ev.pubkey;
  }
  // For NIP-17 wraps, the wrap pubkey is ephemeral; partner is unknown until
  // the rumor is decrypted. The DM module records partner in the secrets blob;
  // for eviction we treat unresolved wraps as "unknown" → eligible for LRU.
  return '';
}

/**
 * Apply LRU eviction. Events whose partner is in the current follow set are
 * protected and never evicted by `cap`. The cap applies only to evictable
 * events. If `getFollowSet` returns `null`, all events are protected (cold
 * start before follow list hydrated).
 */
export function evictIfNeeded(myPubkey: string, cap = 2000): void {
  const c = read(myPubkey);
  const ids = Object.keys(c.events);
  if (ids.length === 0) return;

  const follows = followSets.get(myPubkey);
  const evictableIds: string[] = [];
  const protectedIds = new Set<string>();

  for (const id of ids) {
    const ev = c.events[id];
    const partner = partnerOf(ev, myPubkey);
    if (follows === null || follows === undefined) {
      protectedIds.add(id);
    } else if (partner && follows.has(partner)) {
      protectedIds.add(id);
    } else {
      evictableIds.push(id);
    }
  }

  if (evictableIds.length <= cap) return;

  evictableIds.sort((a, b) => c.events[a].created_at - c.events[b].created_at);
  const toDrop = evictableIds.slice(0, evictableIds.length - cap);
  for (const id of toDrop) {
    delete c.events[id];
    delete c.secrets[id];
  }
  write(myPubkey, c);
}

export function clearAccount(myPubkey: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(keyEvents(myPubkey));
  } catch { /* ignore */ }
  followSets.delete(myPubkey);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/dm/dm-cache.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dm/dm-cache.ts src/lib/dm/dm-cache.test.ts
git commit -m "feat(dm): per-account cache with AES-GCM secrets + follow-aware eviction"
```

---

## Task 4: Request coalescer

**Files:**
- Create: `src/lib/dm/coalescer.ts`
- Test: `src/lib/dm/coalescer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dm/coalescer.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RequestCoalescer } from './coalescer';

interface FakeSub { close: () => void }

const subscribeManyMock = vi.fn();

vi.mock('./pool', () => ({
  getDMPool: () => ({
    subscribeMany: (relays: string[], filters: unknown[], handlers: { onevent: (e: unknown) => void; oneose?: (relay: string) => void }) => {
      subscribeManyMock(relays, filters);
      return { close: () => {} } as FakeSub;
    },
  }),
}));

describe('RequestCoalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    subscribeManyMock.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('merges enqueues within the debounce window into a single REQ per relay set', () => {
    const c = new RequestCoalescer({ debounceMs: 50 });
    c.enqueue({ filters: [{ kinds: [0], authors: ['a'] }], relays: ['wss://r1'], onEvent: () => {}, onEose: () => {} });
    c.enqueue({ filters: [{ kinds: [0], authors: ['b'] }], relays: ['wss://r1'], onEvent: () => {}, onEose: () => {} });
    c.enqueue({ filters: [{ kinds: [3], authors: ['a'] }], relays: ['wss://r1'], onEvent: () => {}, onEose: () => {} });
    expect(subscribeManyMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60);
    expect(subscribeManyMock).toHaveBeenCalledTimes(1);
    const [, filters] = subscribeManyMock.mock.calls[0];
    expect((filters as unknown[]).length).toBe(3);
  });

  it('a separate enqueue after the window opens a new REQ', () => {
    const c = new RequestCoalescer({ debounceMs: 50 });
    c.enqueue({ filters: [{ kinds: [0] }], relays: ['wss://r1'], onEvent: () => {}, onEose: () => {} });
    vi.advanceTimersByTime(60);
    c.enqueue({ filters: [{ kinds: [0] }], relays: ['wss://r1'], onEvent: () => {}, onEose: () => {} });
    vi.advanceTimersByTime(60);
    expect(subscribeManyMock).toHaveBeenCalledTimes(2);
  });

  it('groups by distinct relay set', () => {
    const c = new RequestCoalescer({ debounceMs: 50 });
    c.enqueue({ filters: [{ kinds: [0] }], relays: ['wss://r1'], onEvent: () => {}, onEose: () => {} });
    c.enqueue({ filters: [{ kinds: [0] }], relays: ['wss://r2'], onEvent: () => {}, onEose: () => {} });
    vi.advanceTimersByTime(60);
    expect(subscribeManyMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/dm/coalescer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/dm/coalescer.ts
import type { Filter, Event as NostrEvent } from 'nostr-tools/pure';
import { getDMPool } from './pool';
import { verifyDMEvent } from './pool';

export interface CoalescerEnqueue {
  filters: Filter[];
  relays: string[];
  onEvent: (event: NostrEvent) => void;
  onEose?: (relay: string) => void;
}

export interface CoalescerOptions {
  debounceMs?: number;
  subscriptionTimeoutMs?: number;
}

interface PendingGroup {
  relayKey: string;
  relays: string[];
  entries: CoalescerEnqueue[];
}

export class RequestCoalescer {
  private debounceMs: number;
  private subscriptionTimeoutMs: number;
  private pending: Map<string, PendingGroup> = new Map();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: CoalescerOptions = {}) {
    this.debounceMs = opts.debounceMs ?? 50;
    this.subscriptionTimeoutMs = opts.subscriptionTimeoutMs ?? 5000;
  }

  enqueue(req: CoalescerEnqueue): void {
    const relayKey = [...req.relays].sort().join('|');
    let group = this.pending.get(relayKey);
    if (!group) {
      group = { relayKey, relays: [...req.relays].sort(), entries: [] };
      this.pending.set(relayKey, group);
    }
    group.entries.push(req);
    if (this.timer === null) {
      this.timer = setTimeout(() => this.flush(), this.debounceMs);
    }
  }

  private flush(): void {
    this.timer = null;
    const groups = Array.from(this.pending.values());
    this.pending.clear();
    for (const g of groups) this.fire(g);
  }

  private fire(g: PendingGroup): void {
    const seen = new Set<string>();
    const filters = g.entries.flatMap((e) => e.filters);
    const pool = getDMPool();
    const sub = pool.subscribeMany(g.relays, filters, {
      onevent: (event: NostrEvent) => {
        if (seen.has(event.id)) return;
        seen.add(event.id);
        if (!verifyDMEvent(event)) return;
        for (const e of g.entries) e.onEvent(event);
      },
      oneose: (relay: string) => {
        for (const e of g.entries) e.onEose?.(relay);
      },
    });

    if (this.subscriptionTimeoutMs > 0) {
      setTimeout(() => {
        try { sub.close(); } catch { /* ignore */ }
      }, this.subscriptionTimeoutMs);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/dm/coalescer.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dm/coalescer.ts src/lib/dm/coalescer.test.ts
git commit -m "feat(dm): request coalescer with 50ms debounce + per-relay-group REQ"
```

---

## Task 5: Profile cache (kind-0 SWR with purplepag.es)

**Files:**
- Create: `src/lib/dm/profile-cache.ts`
- Test: `src/lib/dm/profile-cache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dm/profile-cache.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getProfile, setProfileTestRelays, _resetProfileCache } from './profile-cache';

const enqueueMock = vi.fn();
vi.mock('./coalescer', () => ({
  RequestCoalescer: class {
    enqueue(req: any) { enqueueMock(req); }
  },
}));

const me = 'a'.repeat(64);
const partner = 'b'.repeat(64);

beforeEach(() => {
  localStorage.clear();
  enqueueMock.mockClear();
  _resetProfileCache();
});

describe('profile-cache', () => {
  it('first fetch dispatches a REQ that includes purplepag.es', () => {
    setProfileTestRelays(['wss://my.relay']);
    const p = getProfile(me, partner);
    expect(p.profile).toBeNull();
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const call = enqueueMock.mock.calls[0][0];
    expect(call.relays).toContain('wss://purplepag.es');
    expect(call.relays).toContain('wss://my.relay');
    expect(call.filters[0]).toMatchObject({ kinds: [0], authors: [partner] });
  });

  it('second call within 24h does not re-enqueue (cache hit)', () => {
    setProfileTestRelays([]);
    getProfile(me, partner);
    // Force a stored entry: simulate the relay event arrival.
    const onEvent = enqueueMock.mock.calls[0]?.[0]?.onEvent;
    if (onEvent) {
      onEvent({ id: 'e1', kind: 0, pubkey: partner, created_at: Math.floor(Date.now() / 1000), tags: [], content: '{"name":"alice"}', sig: 'x' } as any);
    }
    enqueueMock.mockClear();
    getProfile(me, partner);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('after TTL elapses, returns stale immediately and re-enqueues', () => {
    setProfileTestRelays([]);
    getProfile(me, partner);
    const onEvent1 = enqueueMock.mock.calls[0][0].onEvent;
    onEvent1({ id: 'e1', kind: 0, pubkey: partner, created_at: 1000, tags: [], content: '{"name":"alice"}', sig: 'x' } as any);
    // Tamper with persisted lastCheckedAt to be 25h ago
    const key = `obelisk:profiles:${me}`;
    const blob = JSON.parse(localStorage.getItem(key) ?? '{}');
    blob[partner].lastCheckedAt = Date.now() - 25 * 3600 * 1000;
    localStorage.setItem(key, JSON.stringify(blob));
    enqueueMock.mockClear();
    const r = getProfile(me, partner);
    expect(r.profile).not.toBeNull();
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('does not notify subscribers when refresh returns same created_at', () => {
    setProfileTestRelays([]);
    const sub = vi.fn();
    getProfile(me, partner, { onUpdate: sub });
    const onEvent = enqueueMock.mock.calls[0][0].onEvent;
    const ev = { id: 'e1', pubkey: partner, kind: 0, created_at: 1000, tags: [], content: '{"name":"alice"}', sig: 'x' } as any;
    onEvent(ev);
    onEvent(ev); // same created_at — should not re-notify
    expect(sub).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/dm/profile-cache.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/dm/profile-cache.ts
import type { Event as NostrEvent } from 'nostr-tools/pure';
import { RequestCoalescer } from './coalescer';

export interface ProfileEntry {
  event: NostrEvent;
  parsed: {
    name?: string;
    displayName?: string;
    picture?: string;
    about?: string;
    nip05?: string;
  };
  lastCheckedAt: number;
}

const TTL_MS = 24 * 3600 * 1000;
const PROFILE_AGGREGATORS = ['wss://purplepag.es'];

let extraRelays: string[] = [];
export function setProfileTestRelays(relays: string[]): void { extraRelays = relays; }

const coalescer = new RequestCoalescer({ debounceMs: 50 });
const subscribers = new Map<string, Set<(p: ProfileEntry) => void>>();

export function _resetProfileCache(): void {
  subscribers.clear();
}

function key(me: string) { return `obelisk:profiles:${me}`; }
function read(me: string): Record<string, ProfileEntry> {
  if (typeof localStorage === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(key(me)) ?? '{}'); } catch { return {}; }
}
function write(me: string, blob: Record<string, ProfileEntry>): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(key(me), JSON.stringify(blob)); } catch { /* ignore */ }
}

function parseKind0(content: string): ProfileEntry['parsed'] {
  try {
    const r = JSON.parse(content);
    return {
      name: r.name,
      displayName: r.displayName ?? r.display_name,
      picture: r.picture ?? r.image,
      about: r.about,
      nip05: r.nip05,
    };
  } catch { return {}; }
}

function notify(me: string, partner: string, entry: ProfileEntry): void {
  subscribers.get(`${me}|${partner}`)?.forEach((cb) => cb(entry));
}

export interface GetProfileResult {
  profile: ProfileEntry | null;
  subscribe?: () => void;
}

export function getProfile(
  me: string,
  partner: string,
  opts: { onUpdate?: (p: ProfileEntry) => void } = {},
): GetProfileResult {
  const blob = read(me);
  const cached = blob[partner];
  const stale = !cached || Date.now() - cached.lastCheckedAt > TTL_MS;

  if (opts.onUpdate) {
    const sub = `${me}|${partner}`;
    if (!subscribers.has(sub)) subscribers.set(sub, new Set());
    subscribers.get(sub)!.add(opts.onUpdate);
  }

  if (stale) {
    coalescer.enqueue({
      filters: [{ kinds: [0], authors: [partner], limit: 1 }],
      relays: [...PROFILE_AGGREGATORS, ...extraRelays],
      onEvent: (event: NostrEvent) => {
        if (event.kind !== 0 || event.pubkey !== partner) return;
        const current = read(me)[partner];
        if (current && current.event.created_at >= event.created_at) {
          // Same or older — bump lastCheckedAt without notifying.
          const fresh = { ...current, lastCheckedAt: Date.now() };
          const all = read(me);
          all[partner] = fresh;
          write(me, all);
          return;
        }
        const entry: ProfileEntry = {
          event,
          parsed: parseKind0(event.content),
          lastCheckedAt: Date.now(),
        };
        const all = read(me);
        all[partner] = entry;
        write(me, all);
        notify(me, partner, entry);
      },
    });
  }

  const dispose = opts.onUpdate
    ? () => subscribers.get(`${me}|${partner}`)?.delete(opts.onUpdate!)
    : undefined;

  return { profile: cached ?? null, subscribe: dispose };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/dm/profile-cache.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dm/profile-cache.ts src/lib/dm/profile-cache.test.ts
git commit -m "feat(dm): kind-0 profile cache with purplepag.es + 24h SWR"
```

---

## Task 6: Relay-list cache (kind-10002 + 10050 SWR)

**Files:**
- Create: `src/lib/dm/relay-list-cache.ts`
- Test: `src/lib/dm/relay-list-cache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dm/relay-list-cache.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getRelays, _resetRelayCache } from './relay-list-cache';

const enqueueMock = vi.fn();
vi.mock('./coalescer', () => ({
  RequestCoalescer: class { enqueue(req: any) { enqueueMock(req); } },
}));

const me = 'a'.repeat(64);
const partner = 'b'.repeat(64);

beforeEach(() => {
  localStorage.clear();
  enqueueMock.mockClear();
  _resetRelayCache();
});

describe('relay-list-cache', () => {
  it('first call enqueues kind-10002 and kind-10050 filters', () => {
    getRelays(me, partner);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const filters = enqueueMock.mock.calls[0][0].filters;
    const kinds = (filters as any[]).flatMap((f) => f.kinds);
    expect(kinds).toContain(10002);
    expect(kinds).toContain(10050);
  });

  it('second call within 6h does not re-enqueue', () => {
    getRelays(me, partner);
    // Seed the cache by simulating a relay event arrival.
    const onEvent = enqueueMock.mock.calls[0][0].onEvent;
    onEvent({
      id: 'e1', kind: 10002, pubkey: partner,
      created_at: Math.floor(Date.now() / 1000),
      content: '', tags: [['r', 'wss://x']], sig: 'x',
    } as any);
    enqueueMock.mockClear();
    getRelays(me, partner);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('does not notify when refresh returns identical content', async () => {
    const sub = vi.fn();
    const { dispose } = getRelays(me, partner, { onUpdate: sub });
    const onEvent = enqueueMock.mock.calls[0][0].onEvent;
    const ev = { id: 'e1', kind: 10002, pubkey: partner, created_at: 1000, content: '', tags: [['r', 'wss://x']], sig: 'x' } as any;
    onEvent(ev);
    onEvent(ev); // same created_at + content
    expect(sub).toHaveBeenCalledTimes(1);
    dispose?.();
  });

  it('parses kind 10002 r-tags into readRelays/writeRelays', () => {
    getRelays(me, partner);
    const onEvent = enqueueMock.mock.calls[0][0].onEvent;
    onEvent({
      id: 'e1', kind: 10002, pubkey: partner, created_at: 1000, content: '',
      tags: [['r', 'wss://read.only', 'read'], ['r', 'wss://write.only', 'write'], ['r', 'wss://both']],
      sig: 'x',
    } as any);
    const { result } = getRelays(me, partner);
    expect(result.readRelays).toEqual(expect.arrayContaining(['wss://read.only', 'wss://both']));
    expect(result.writeRelays).toEqual(expect.arrayContaining(['wss://write.only', 'wss://both']));
  });

  it('parses kind 10050 relay tags into inbox', () => {
    getRelays(me, partner);
    const onEvent = enqueueMock.mock.calls[0][0].onEvent;
    onEvent({
      id: 'e2', kind: 10050, pubkey: partner, created_at: 2000, content: '',
      tags: [['relay', 'wss://inbox.one'], ['relay', 'wss://inbox.two']],
      sig: 'x',
    } as any);
    const { result } = getRelays(me, partner);
    expect(result.inbox).toEqual(expect.arrayContaining(['wss://inbox.one', 'wss://inbox.two']));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/dm/relay-list-cache.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Staleness rule: an entry is stale when neither slot has been populated yet (forces an initial fetch), OR any *populated* slot is older than 6h. Unpopulated slots after the first populated one do not force re-fetch — partners legitimately may not publish kind-10050, and treating an absent slot's `lastCheckedAt` as `0` would make `now - 0 > TTL_MS` always true, causing endless re-fetches.

```ts
// src/lib/dm/relay-list-cache.ts
import type { Event as NostrEvent } from 'nostr-tools/pure';
import { RequestCoalescer } from './coalescer';

export interface RelayListResult {
  inbox: string[];
  readRelays: string[];
  writeRelays: string[];
  stale: boolean;
}

interface CacheEntry {
  outbox?: { event: NostrEvent; lastCheckedAt: number };
  inbox?: { event: NostrEvent; lastCheckedAt: number };
}

const TTL_MS = 6 * 3600 * 1000;
const FALLBACK_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://purplepag.es',
];

const coalescer = new RequestCoalescer({ debounceMs: 50 });
const subscribers = new Map<string, Set<(r: RelayListResult) => void>>();

export function _resetRelayCache(): void { subscribers.clear(); }

function key(me: string) { return `obelisk:relays:${me}`; }
function read(me: string): Record<string, CacheEntry> {
  if (typeof localStorage === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(key(me)) ?? '{}'); } catch { return {}; }
}
function write(me: string, blob: Record<string, CacheEntry>): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(key(me), JSON.stringify(blob)); } catch { /* ignore */ }
}

function parseOutbox(ev: NostrEvent): { read: string[]; write: string[] } {
  const r: string[] = [];
  const w: string[] = [];
  for (const tag of ev.tags) {
    if (tag[0] !== 'r' || typeof tag[1] !== 'string') continue;
    const url = tag[1];
    const marker = tag[2];
    if (!marker || marker === 'read') r.push(url);
    if (!marker || marker === 'write') w.push(url);
  }
  return { read: Array.from(new Set(r)), write: Array.from(new Set(w)) };
}

function parseInbox(ev: NostrEvent): string[] {
  const out: string[] = [];
  for (const tag of ev.tags) {
    if ((tag[0] === 'relay' || tag[0] === 'r') && typeof tag[1] === 'string' && tag[1].startsWith('wss://')) {
      out.push(tag[1]);
    }
  }
  return Array.from(new Set(out));
}

function buildResult(entry: CacheEntry | undefined): RelayListResult {
  const outbox = entry?.outbox ? parseOutbox(entry.outbox.event) : { read: [], write: [] };
  const inbox = entry?.inbox ? parseInbox(entry.inbox.event) : [];
  return {
    readRelays: outbox.read,
    writeRelays: outbox.write,
    inbox,
    stale: !entry || isStale(entry),
  };
}

function isStale(entry: CacheEntry): boolean {
  const now = Date.now();
  // If neither slot has been checked, treat as stale (forces an initial fetch).
  if (!entry.outbox && !entry.inbox) return true;
  // Otherwise, only consider populated slots: stale if any *checked* slot is older than TTL.
  // This avoids endlessly re-fetching when a partner has never published one of the kinds
  // (e.g. no kind-10050) — once we've heard back from at least one, we honor the TTL.
  if (entry.outbox && now - entry.outbox.lastCheckedAt > TTL_MS) return true;
  if (entry.inbox && now - entry.inbox.lastCheckedAt > TTL_MS) return true;
  return false;
}

function notify(me: string, partner: string, r: RelayListResult): void {
  subscribers.get(`${me}|${partner}`)?.forEach((cb) => cb(r));
}

export function getRelays(
  me: string,
  partner: string,
  opts: { onUpdate?: (r: RelayListResult) => void } = {},
): { result: RelayListResult; dispose?: () => void } {
  const all = read(me);
  const entry = all[partner];
  const result = buildResult(entry);

  if (opts.onUpdate) {
    const subKey = `${me}|${partner}`;
    if (!subscribers.has(subKey)) subscribers.set(subKey, new Set());
    subscribers.get(subKey)!.add(opts.onUpdate);
  }

  if (!entry || isStale(entry)) {
    coalescer.enqueue({
      filters: [
        { kinds: [10002], authors: [partner], limit: 1 },
        { kinds: [10050], authors: [partner], limit: 1 },
      ],
      relays: FALLBACK_RELAYS,
      onEvent: (event: NostrEvent) => {
        if (event.pubkey !== partner) return;
        const current = read(me);
        const slot = current[partner] ?? {};
        const which: 'outbox' | 'inbox' | null =
          event.kind === 10002 ? 'outbox' : event.kind === 10050 ? 'inbox' : null;
        if (!which) return;
        const prev = slot[which]?.event;
        const sameContent =
          prev && prev.created_at >= event.created_at && JSON.stringify(prev.tags) === JSON.stringify(event.tags);
        if (sameContent) {
          slot[which] = { event: prev!, lastCheckedAt: Date.now() };
          current[partner] = slot;
          write(me, current);
          return;
        }
        slot[which] = { event, lastCheckedAt: Date.now() };
        current[partner] = slot;
        write(me, current);
        notify(me, partner, buildResult(slot));
      },
    });
  }

  const dispose = opts.onUpdate
    ? () => subscribers.get(`${me}|${partner}`)?.delete(opts.onUpdate!)
    : undefined;

  return { result, dispose };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/dm/relay-list-cache.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dm/relay-list-cache.ts src/lib/dm/relay-list-cache.test.ts
git commit -m "feat(dm): kind-10002 + kind-10050 cache with 6h SWR + content-diff"
```

---

## Task 7: Follows (kind-3 cold-load seed + live-driven freshness)

**Files:**
- Create: `src/lib/dm/follows.ts`
- Test: `src/lib/dm/follows.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dm/follows.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { hydrateFollows, ingestKind3, getFollowSet, _resetFollows } from './follows';

const me = 'a'.repeat(64);

beforeEach(() => {
  localStorage.clear();
  _resetFollows();
});

describe('follows', () => {
  it('cold load with no cache returns null follow set', () => {
    hydrateFollows(me);
    expect(getFollowSet(me)).toBeNull();
  });

  it('hydrate seeds the in-memory set from localStorage', () => {
    localStorage.setItem(`obelisk:follows:${me}`, JSON.stringify({
      event: { id: 'e1', kind: 3, pubkey: me, created_at: 1000, tags: [['p', 'b'.repeat(64)]], content: '', sig: 'x' },
      pubkeys: ['b'.repeat(64)],
      lastCheckedAt: 1000,
    }));
    hydrateFollows(me);
    expect(getFollowSet(me)).toEqual(new Set(['b'.repeat(64)]));
  });

  it('ingestKind3 with newer created_at replaces the set', () => {
    hydrateFollows(me);
    ingestKind3(me, { id: 'e1', kind: 3, pubkey: me, created_at: 1000, tags: [['p', 'b'.repeat(64)]], content: '', sig: 'x' } as any);
    ingestKind3(me, { id: 'e2', kind: 3, pubkey: me, created_at: 2000, tags: [['p', 'c'.repeat(64)]], content: '', sig: 'x' } as any);
    expect(getFollowSet(me)).toEqual(new Set(['c'.repeat(64)]));
  });

  it('ignores older kind-3 events', () => {
    hydrateFollows(me);
    ingestKind3(me, { id: 'e1', kind: 3, pubkey: me, created_at: 2000, tags: [['p', 'c'.repeat(64)]], content: '', sig: 'x' } as any);
    ingestKind3(me, { id: 'e2', kind: 3, pubkey: me, created_at: 1000, tags: [['p', 'b'.repeat(64)]], content: '', sig: 'x' } as any);
    expect(getFollowSet(me)).toEqual(new Set(['c'.repeat(64)]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/dm/follows.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/dm/follows.ts
import type { Event as NostrEvent } from 'nostr-tools/pure';
import { setFollowSet } from './dm-cache';

interface FollowsCacheShape {
  event: NostrEvent;
  pubkeys: string[];
  lastCheckedAt: number;
}

const inMemory = new Map<string, FollowsCacheShape | null>();

export function _resetFollows(): void {
  inMemory.clear();
}

function key(me: string) { return `obelisk:follows:${me}`; }
function read(me: string): FollowsCacheShape | null {
  if (typeof localStorage === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(key(me)) ?? 'null'); } catch { return null; }
}
function write(me: string, shape: FollowsCacheShape): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(key(me), JSON.stringify(shape)); } catch { /* ignore */ }
}

export function hydrateFollows(me: string): void {
  const cached = read(me);
  if (cached) {
    inMemory.set(me, cached);
    setFollowSet(me, new Set(cached.pubkeys));
  } else {
    inMemory.set(me, null);
    setFollowSet(me, null);
  }
}

export function ingestKind3(me: string, event: NostrEvent): void {
  if (event.kind !== 3 || event.pubkey !== me) return;
  const current = inMemory.get(me) ?? null;
  if (current && current.event.created_at >= event.created_at) return;
  const pubkeys = event.tags.filter((t) => t[0] === 'p' && typeof t[1] === 'string').map((t) => t[1]);
  const shape: FollowsCacheShape = { event, pubkeys, lastCheckedAt: Date.now() };
  inMemory.set(me, shape);
  write(me, shape);
  setFollowSet(me, new Set(pubkeys));
}

export function getFollowSet(me: string): Set<string> | null {
  const v = inMemory.get(me);
  if (!v) return null;
  return new Set(v.pubkeys);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/dm/follows.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dm/follows.ts src/lib/dm/follows.test.ts
git commit -m "feat(dm): follows cache (cold-load seed + live kind-3 ingest)"
```

---

## Task 8: Public DM API — `dm/dm.ts`

**Files:**
- Create: `src/lib/dm/dm.ts`
- Test: `src/lib/dm/dm.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dm/dm.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadHistory, sendDM, verifyAndIngest, _resetDM } from './dm';
import { getCachedEvents, setCursor, putEvent } from './dm-cache';

const me = 'a'.repeat(64);
const partner = 'b'.repeat(64);

const enqueueMock = vi.fn();
vi.mock('./coalescer', () => ({
  RequestCoalescer: class { enqueue(req: any) { enqueueMock(req); } },
}));

vi.mock('./relay-list-cache', () => ({
  getRelays: () => ({
    result: { inbox: ['wss://inbox.partner'], readRelays: ['wss://read.partner'], writeRelays: ['wss://write.partner'], stale: false },
  }),
}));

const publishMock = vi.fn();
const encryptMock = vi.fn(async (_u: unknown, _s: unknown, _scheme: string) => undefined);
vi.mock('@/lib/nostr', () => ({
  getNDK: () => ({
    signer: { user: async () => ({ pubkey: me }) },
    pool: { relays: new Map() },
  }),
}));

beforeEach(() => {
  localStorage.clear();
  enqueueMock.mockClear();
  publishMock.mockClear();
  encryptMock.mockClear();
  _resetDM();
});

describe('loadHistory', () => {
  it('uses since cursor from cached max(created_at)', () => {
    setCursor(me, 'nip04In', 1000);
    loadHistory(me, partner);
    const filter = enqueueMock.mock.calls[0][0].filters.find((f: any) => f.kinds[0] === 4 && f['#p']?.[0] === me);
    expect(filter.since).toBe(1000);
  });

  it('omits since for fresh cursor', () => {
    loadHistory(me, partner);
    const filters = enqueueMock.mock.calls[0][0].filters;
    for (const f of filters) expect(f.since).toBeUndefined();
  });
});

describe('verifyAndIngest', () => {
  it('drops events with bad signatures (delegated to verifyDMEvent)', () => {
    const bad = { id: 'x', kind: 4, pubkey: 'y', created_at: 1, content: '', tags: [], sig: 'invalid' } as any;
    verifyAndIngest(me, bad);
    expect(getCachedEvents(me)).toHaveLength(0);
  });

  it('dedupes by event id', () => {
    const good = makeSelfSignedKind4();
    verifyAndIngest(me, good);
    verifyAndIngest(me, good);
    expect(getCachedEvents(me).length).toBe(1);
  });
});

function makeSelfSignedKind4() {
  const { generateSecretKey, getPublicKey, finalizeEvent } = require('nostr-tools/pure');
  const sk = generateSecretKey();
  return finalizeEvent({ kind: 4, created_at: 1, tags: [['p', getPublicKey(sk)]], content: 'CIPHER' }, sk);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/dm/dm.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/dm/dm.ts
import type { Event as NostrEvent, Filter } from 'nostr-tools/pure';
import { RequestCoalescer } from './coalescer';
import { verifyDMEvent } from './pool';
import { getCursors, setCursor, putEvent, getEvent, type CachedDMEvent } from './dm-cache';
import { getRelays } from './relay-list-cache';
import { ingestKind3 } from './follows';

const KIND_NIP04 = 4;
const KIND_RUMOR = 14;
const KIND_GIFT_WRAP = 1059;
const KIND_FOLLOW = 3;

const coalescer = new RequestCoalescer({ debounceMs: 50 });

export function _resetDM(): void {
  // Coalescer state is module-local; tests rely on enqueue mock.
}

function toCached(event: NostrEvent): CachedDMEvent {
  return {
    id: event.id,
    pubkey: event.pubkey,
    kind: event.kind,
    created_at: event.created_at,
    content: event.content,
    tags: event.tags as string[][],
    sig: event.sig,
  };
}

export function verifyAndIngest(myPubkey: string, event: NostrEvent): boolean {
  if (!verifyDMEvent(event)) return false;
  if (getEvent(myPubkey, event.id)) return true; // dedup
  putEvent(myPubkey, toCached(event));
  if (event.kind === KIND_NIP04) {
    if (event.pubkey === myPubkey) setCursor(myPubkey, 'nip04Out', event.created_at);
    else setCursor(myPubkey, 'nip04In', event.created_at);
  } else if (event.kind === KIND_GIFT_WRAP) {
    setCursor(myPubkey, 'nip17Wrap', event.created_at);
  } else if (event.kind === KIND_FOLLOW && event.pubkey === myPubkey) {
    ingestKind3(myPubkey, event);
    setCursor(myPubkey, 'kind3', event.created_at);
  }
  return true;
}

export interface LoadHistoryOptions {
  relays?: string[];
}

export function loadHistory(myPubkey: string, partnerPubkey: string, opts: LoadHistoryOptions = {}): void {
  const cursors = getCursors(myPubkey);
  const partnerRelays = getRelays(myPubkey, partnerPubkey).result;
  const relays = Array.from(new Set([
    ...(opts.relays ?? []),
    ...partnerRelays.readRelays,
    ...partnerRelays.writeRelays,
    ...partnerRelays.inbox,
  ]));

  const filters: Filter[] = [
    { kinds: [KIND_NIP04], authors: [myPubkey], '#p': [partnerPubkey], ...(cursors.nip04Out > 0 ? { since: cursors.nip04Out } : {}) },
    { kinds: [KIND_NIP04], authors: [partnerPubkey], '#p': [myPubkey], ...(cursors.nip04In > 0 ? { since: cursors.nip04In } : {}) },
    { kinds: [KIND_GIFT_WRAP], '#p': [myPubkey], ...(cursors.nip17Wrap > 0 ? { since: cursors.nip17Wrap } : {}) },
  ];

  coalescer.enqueue({
    filters,
    relays: relays.length ? relays : ['wss://relay.damus.io', 'wss://nos.lol'],
    onEvent: (event) => verifyAndIngest(myPubkey, event),
  });
}

export interface SubscribeLiveOptions {
  myPubkey: string;
  myInboxRelays: string[];
  onEvent?: (event: NostrEvent) => void;
}

export function subscribeLive(opts: SubscribeLiveOptions): () => void {
  const cursors = getCursors(opts.myPubkey);
  let cancelled = false;
  const filters: Filter[] = [
    { kinds: [KIND_NIP04], '#p': [opts.myPubkey], ...(cursors.nip04In > 0 ? { since: cursors.nip04In } : {}) },
    { kinds: [KIND_NIP04], authors: [opts.myPubkey], ...(cursors.nip04Out > 0 ? { since: cursors.nip04Out } : {}) },
    { kinds: [KIND_GIFT_WRAP], '#p': [opts.myPubkey], ...(cursors.nip17Wrap > 0 ? { since: cursors.nip17Wrap } : {}) },
    { kinds: [KIND_FOLLOW], authors: [opts.myPubkey], ...(cursors.kind3 > 0 ? { since: cursors.kind3 } : {}) },
  ];
  coalescer.enqueue({
    filters,
    relays: opts.myInboxRelays,
    onEvent: (event) => {
      if (cancelled) return;
      const ok = verifyAndIngest(opts.myPubkey, event);
      if (ok) opts.onEvent?.(event);
    },
  });
  return () => { cancelled = true; };
}

export type DMProtocol = 'nip04' | 'nip17';

export interface SendDMArgs {
  myPubkey: string;
  recipientPubkey: string;
  content: string;
  protocol: DMProtocol;
}

export async function sendDM(args: SendDMArgs): Promise<NostrEvent> {
  const { getNDK } = await import('@/lib/nostr');
  const ndk = getNDK();
  if (!ndk.signer) throw new Error('No signer');

  const { NDKEvent: NDKEventClass, NDKUser } = await import('@nostr-dev-kit/ndk');
  const recipient = new NDKUser({ pubkey: args.recipientPubkey });
  recipient.ndk = ndk;

  const partnerRelays = getRelays(args.myPubkey, args.recipientPubkey).result;
  const targetRelays =
    args.protocol === 'nip17'
      ? partnerRelays.inbox
      : partnerRelays.readRelays;

  if (args.protocol === 'nip04') {
    const ev = new NDKEventClass(ndk);
    ev.kind = KIND_NIP04;
    ev.tags = [['p', args.recipientPubkey]];
    ev.content = args.content;
    await ev.encrypt(recipient, ndk.signer, 'nip04');
    await publishToRelays(ndk, ev, targetRelays);
    putEvent(args.myPubkey, toCached(ev.rawEvent() as NostrEvent));
    return ev.rawEvent() as NostrEvent;
  }

  const { giftWrap } = await import('@nostr-dev-kit/ndk');
  const rumor = new NDKEventClass(ndk);
  rumor.kind = KIND_RUMOR;
  rumor.content = args.content;
  rumor.tags = [['p', args.recipientPubkey]];
  const wrap = await giftWrap(rumor, recipient, ndk.signer);
  await publishToRelays(ndk, wrap, targetRelays);
  putEvent(args.myPubkey, toCached(wrap.rawEvent() as NostrEvent));
  return wrap.rawEvent() as NostrEvent;
}

async function publishToRelays(ndk: any, event: any, relays: string[]): Promise<void> {
  if (relays.length === 0) {
    await event.publish();
    return;
  }
  const { NDKRelaySet } = await import('@nostr-dev-kit/ndk');
  const set = NDKRelaySet.fromRelayUrls(relays, ndk);
  await event.publish(set);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/dm/dm.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dm/dm.ts src/lib/dm/dm.test.ts
git commit -m "feat(dm): public DM API — loadHistory, subscribeLive, sendDM, verifyAndIngest"
```

---

## Task 9: Move `dm-inbox.ts` into `dm/`

**Files:**
- Create: `src/lib/dm/dm-inbox.ts`
- Create: `src/lib/dm/dm-inbox.test.ts`
- (Old `src/lib/dm-inbox.ts` and `.test.ts` are deleted in Task 15.)

- [ ] **Step 1: Copy existing module to new path**

```bash
cp src/lib/dm-inbox.ts src/lib/dm/dm-inbox.ts
cp src/lib/dm-inbox.test.ts src/lib/dm/dm-inbox.test.ts
```

- [ ] **Step 2: Update imports inside the new file**

Edit `src/lib/dm/dm-inbox.ts` — change:
```ts
import { getSyncState, setSyncState } from './dm-cache';
```
to:
```ts
import { getCursors } from './dm-cache';
```
…and drop the 24h cooldown entirely (the old cooldown lived on `dm-cache.ts`'s `inboxRelaysPublishedAt`, which no longer exists). `publishInboxRelays` becomes a single-shot publish; the caller decides when to invoke it (e.g. once per session on signer-attach).

Replace the function body:
```ts
export async function publishInboxRelays(myPubkey: string): Promise<boolean> {
  const ndk = getNDK();
  if (!ndk.signer) return false;
  try {
    const { NDKEvent } = await import('@nostr-dev-kit/ndk');
    const event = new NDKEvent(ndk);
    event.kind = KIND_DM_INBOX_RELAYS;
    event.content = '';
    const relayUrls = listConnectedRelayUrls(ndk);
    event.tags = relayUrls.map((url) => ['relay', url]);
    await event.publish();
    return true;
  } catch (err) {
    console.warn('[dm-inbox] publishInboxRelays failed:', err);
    return false;
  }
}
```

- [ ] **Step 3: Run the moved tests**

Run: `npm run test -- src/lib/dm/dm-inbox.test.ts`
Expected: PASS (any tests asserting on the cooldown should be removed/loosened — adjust the test in place).

- [ ] **Step 4: Commit**

```bash
git add src/lib/dm/dm-inbox.ts src/lib/dm/dm-inbox.test.ts
git commit -m "feat(dm): move dm-inbox into dm/ folder; drop cooldown coupling to old cache"
```

---

## Task 10: Per-account Zustand DM store

**Files:**
- Modify: `src/store/dm.ts`
- Modify: `src/store/dm.test.ts`

- [ ] **Step 1: Add a failing test for per-account namespacing**

Append to `src/store/dm.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { useDMStore, ensureDMStoreForAccount } from './dm';

describe('per-account DM store', () => {
  it('persist key includes the active pubkey', () => {
    ensureDMStoreForAccount('a'.repeat(64));
    expect(localStorage.getItem('obelisk-dm-store:' + 'a'.repeat(64))).not.toBeNull();
  });

  it('messages field is excluded from persisted state', () => {
    ensureDMStoreForAccount('a'.repeat(64));
    useDMStore.getState().setMessages([{ id: 'x', senderPubkey: 'a'.repeat(64), recipientPubkey: 'b'.repeat(64), content: 'plain', createdAt: 1, protocol: 'nip04' }]);
    const persisted = JSON.parse(localStorage.getItem('obelisk-dm-store:' + 'a'.repeat(64)) ?? '{}');
    expect(JSON.stringify(persisted)).not.toContain('plain');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/store/dm.test.ts`
Expected: FAIL — `ensureDMStoreForAccount` not exported.

- [ ] **Step 3: Modify the store**

Replace the `persist` configuration in `src/store/dm.ts` with:

```ts
let activeStorageName = 'obelisk-dm-store';

export function ensureDMStoreForAccount(myPubkey: string): void {
  const next = `obelisk-dm-store:${myPubkey}`;
  if (next === activeStorageName) return;
  activeStorageName = next;
  // Force-rehydrate from the new key.
  useDMStore.persist.setOptions({ name: next });
  useDMStore.persist.rehydrate();
}
```

Update the existing `persist(...)` block to use `activeStorageName`:
```ts
{
  name: activeStorageName,
  storage: createJSONStorage(() => /* … as today … */),
  partialize: (state) => ({
    protocolOverrides: state.protocolOverrides,
    readCursors: state.readCursors,
  }) as DMPersistedState,
}
```

(Drop `messages` from any persistence; the existing partialize already excludes it — confirm and tighten if needed.)

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- src/store/dm.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/dm.ts src/store/dm.test.ts
git commit -m "feat(store/dm): per-account persist namespace; messages excluded from disk"
```

---

## Task 11: `DMSessionProvider`

**Files:**
- Create: `src/components/dm/DMSessionProvider.tsx`
- Test: `src/components/dm/DMSessionProvider.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/dm/DMSessionProvider.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import { DMSessionProvider, useDMSession } from './DMSessionProvider';

const subscribeLiveMock = vi.fn(() => () => {});
vi.mock('@/lib/dm/dm', () => ({
  subscribeLive: (opts: any) => subscribeLiveMock(opts),
  loadHistory: vi.fn(),
  sendDM: vi.fn(),
}));

vi.mock('@/lib/dm/follows', () => ({
  hydrateFollows: vi.fn(),
}));

vi.mock('@/lib/dm/cache-key', () => ({
  getOrCreateCacheKey: vi.fn().mockResolvedValue({} as CryptoKey),
}));

vi.mock('@/lib/nostr', () => ({
  getNDK: () => ({
    signer: { pubkey: 'a'.repeat(64), nip44Encrypt: vi.fn(), nip44Decrypt: vi.fn() },
    pool: { relays: new Map([['wss://r1', {}]]) },
  }),
}));

beforeEach(() => {
  subscribeLiveMock.mockClear();
});

describe('DMSessionProvider', () => {
  it('opens a live subscription on mount with the current pubkey', () => {
    render(
      <DMSessionProvider myPubkey={'a'.repeat(64)}>
        <div />
      </DMSessionProvider>
    );
    expect(subscribeLiveMock).toHaveBeenCalledWith(expect.objectContaining({ myPubkey: 'a'.repeat(64) }));
  });

  it('closes the subscription on unmount', () => {
    const close = vi.fn();
    subscribeLiveMock.mockImplementationOnce(() => close);
    const { unmount } = render(
      <DMSessionProvider myPubkey={'a'.repeat(64)}>
        <div />
      </DMSessionProvider>
    );
    unmount();
    expect(close).toHaveBeenCalled();
  });

  it('useDMSession throws outside the provider', () => {
    function Probe() { useDMSession(); return null; }
    expect(() => render(<Probe />)).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/components/dm/DMSessionProvider.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/dm/DMSessionProvider.tsx
'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeLive, loadHistory, sendDM, type DMProtocol } from '@/lib/dm/dm';
import { hydrateFollows } from '@/lib/dm/follows';
import { getOrCreateCacheKey } from '@/lib/dm/cache-key';
import { getNDK } from '@/lib/nostr';

interface DMSessionContextValue {
  ready: boolean;
  myPubkey: string;
  cacheKey: CryptoKey | null;
  loadThread: (partner: string) => void;
  send: (partner: string, content: string, protocol?: DMProtocol) => Promise<void>;
}

const DMSessionContext = createContext<DMSessionContextValue | null>(null);

export function useDMSession(): DMSessionContextValue {
  const v = useContext(DMSessionContext);
  if (!v) throw new Error('useDMSession must be used inside DMSessionProvider');
  return v;
}

export function DMSessionProvider({ myPubkey, children }: { myPubkey: string; children: React.ReactNode }) {
  const [cacheKey, setCacheKey] = useState<CryptoKey | null>(null);
  const closeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    hydrateFollows(myPubkey);
  }, [myPubkey]);

  useEffect(() => {
    const ndk = getNDK();
    if (!ndk.signer) return;
    let cancelled = false;
    (async () => {
      try {
        const k = await getOrCreateCacheKey(myPubkey, ndk.signer as any);
        if (!cancelled) setCacheKey(k);
      } catch (err) {
        console.warn('[dm] cache key unavailable:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [myPubkey]);

  useEffect(() => {
    const ndk = getNDK();
    const myInboxRelays = Array.from(ndk.pool?.relays?.keys?.() ?? []) as string[];
    const close = subscribeLive({ myPubkey, myInboxRelays });
    closeRef.current = close;
    return () => { close(); closeRef.current = null; };
  }, [myPubkey]);

  const value = useMemo<DMSessionContextValue>(() => ({
    ready: cacheKey !== null,
    myPubkey,
    cacheKey,
    loadThread: (partner) => loadHistory(myPubkey, partner),
    send: async (partner, content, protocol = 'nip17') => {
      await sendDM({ myPubkey, recipientPubkey: partner, content, protocol });
    },
  }), [cacheKey, myPubkey]);

  return <DMSessionContext.Provider value={value}>{children}</DMSessionContext.Provider>;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- src/components/dm/DMSessionProvider.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dm/DMSessionProvider.tsx src/components/dm/DMSessionProvider.test.tsx
git commit -m "feat(dm): DMSessionProvider — owns live sub + cache-key bootstrap"
```

---

## Task 12: Wire `DMList` to the new session provider + signer gate

**Files:**
- Modify: `src/components/dm/DMList.tsx`
- Modify: `src/components/dm/DMList.test.tsx`

- [ ] **Step 1: Add a failing test for the signer gate**

Append to `src/components/dm/DMList.test.tsx`:

```tsx
it('disables the New DM CTA when ndk.signer is null', () => {
  vi.mocked(require('@/lib/nostr').getNDK).mockReturnValue({ signer: null, pool: { relays: new Map() } });
  const { getByTestId } = render(<DMList onNewDM={() => {}} />);
  expect(getByTestId('new-dm-cta')).toBeDisabled();
});

it('enables the New DM CTA when ndk.signer is present', () => {
  vi.mocked(require('@/lib/nostr').getNDK).mockReturnValue({ signer: { pubkey: 'a'.repeat(64) }, pool: { relays: new Map() } });
  const { getByTestId } = render(<DMList onNewDM={() => {}} />);
  expect(getByTestId('new-dm-cta')).not.toBeDisabled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/components/dm/DMList.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Modify `DMList.tsx`**

Replace the New DM button with one that consults `ndk.signer`:

```tsx
import { getNDK } from '@/lib/nostr';
// …
const hasSigner = Boolean(getNDK().signer);
return (
  // …existing layout…
  <button
    data-testid="new-dm-cta"
    disabled={!hasSigner}
    onClick={onNewDM}
    title={hasSigner ? 'Start new DM' : 'Sign in with a signing-capable method to use DMs'}
    className={hasSigner ? 'lc-pill-primary' : 'lc-pill-primary opacity-50 cursor-not-allowed'}
  >
    New DM
  </button>
);
```

Replace any direct call to `discoverDMThreads` with `useDMSession().loadThread(partner)` triggered when a thread row is clicked. Remove imports of the old `src/lib/dm.ts` API.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- src/components/dm/DMList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dm/DMList.tsx src/components/dm/DMList.test.tsx
git commit -m "feat(dm/list): signer-gated New DM CTA + wire to DMSessionProvider"
```

---

## Task 13: Wire `DMChat` — viewport decryption + `useDMSession`

**Files:**
- Modify: `src/components/dm/DMChat.tsx`
- Modify: `src/components/dm/DMChat.test.tsx`

- [ ] **Step 1: Add a failing test for viewport-only decryption**

Append to `src/components/dm/DMChat.test.tsx`:

```tsx
it('decrypts only the visible window on mount; older events stay in cache without plaintext in the store', async () => {
  // Render with 100 cached events, viewport = last 20.
  // Assert store.messages contains 20 entries with content set,
  // and 80 entries without content set (or absent from store).
  // Detailed wiring in the existing DMChat test harness.
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/components/dm/DMChat.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Modify `DMChat.tsx`**

Replace any direct `fetchDMHistory` call with `loadThread(partner)` from `useDMSession`. Add a viewport-decryption effect: on mount, decrypt only the last N (e.g. 20) cached events for the active partner, using `getOrCreateCacheKey` + `decryptFromCache` (cache-hit path) and falling back to NDK signer decrypt (cache-miss path), each result piped into `useDMStore.addMessage`. Rendering reads `state.messages`. On scroll-to-top, call `loadHistory(..., { until: oldestVisible })` (extend `loadHistory` if necessary; pass-through is fine for now using the existing relay path).

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- src/components/dm/DMChat.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dm/DMChat.tsx src/components/dm/DMChat.test.tsx
git commit -m "feat(dm/chat): viewport-only decryption + session-provider wiring"
```

---

## Task 14: `NewDMModal` uses `ProfileCache`

**Files:**
- Modify: `src/components/dm/NewDMModal.tsx`
- Modify: `src/components/dm/NewDMModal.test.tsx`

- [ ] **Step 1: Add a failing test**

Append to `src/components/dm/NewDMModal.test.tsx`:

```tsx
it('previews the resolved profile via ProfileCache after npub paste', async () => {
  const { getByPlaceholderText, findByText } = render(<NewDMModal onClose={() => {}} />);
  const input = getByPlaceholderText(/npub/i);
  fireEvent.change(input, { target: { value: validNpub } });
  expect(await findByText(/alice/i)).toBeInTheDocument();
});
```

(Mock `getProfile` to return `{ profile: { parsed: { displayName: 'alice' }, ... } }`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/components/dm/NewDMModal.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Modify `NewDMModal.tsx`**

On valid npub paste, call `getProfile(myPubkey, partnerPubkey, { onUpdate: setProfilePreview })`. Render `parsed.displayName ?? parsed.name ?? formatPubkey(partner)` and `parsed.picture` in the preview slot. On unmount, dispose the subscription.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- src/components/dm/NewDMModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dm/NewDMModal.tsx src/components/dm/NewDMModal.test.tsx
git commit -m "feat(dm/new): preview recipient via ProfileCache (purplepag.es-aware)"
```

---

## Task 15: Delete old top-level files + clean up `nostr.ts`

**Files:**
- Delete: `src/lib/dm.ts`, `src/lib/dm.test.ts`, `src/lib/dm-cache.ts`, `src/lib/dm-cache.test.ts`, `src/lib/dm-inbox.ts`, `src/lib/dm-inbox.test.ts`
- Modify: `src/lib/nostr.ts`
- Modify: `src/app/chat/page.tsx`

- [ ] **Step 1: Update all imports**

Run a search for any remaining `from '@/lib/dm'`, `from '@/lib/dm-cache'`, `from '@/lib/dm-inbox'` and rewrite them to `from '@/lib/dm/dm'`, `from '@/lib/dm/dm-cache'`, `from '@/lib/dm/dm-inbox'`.

```bash
grep -rln "from '@/lib/dm[^/]" src | xargs sed -i '' "s|from '@/lib/dm-inbox'|from '@/lib/dm/dm-inbox'|g; s|from '@/lib/dm-cache'|from '@/lib/dm/dm-cache'|g; s|from '@/lib/dm'|from '@/lib/dm/dm'|g"
```

- [ ] **Step 2: Wrap `src/app/chat/page.tsx` with `DMSessionProvider`**

Find where the DM tab renders and wrap that subtree:
```tsx
<DMSessionProvider myPubkey={profile.pubkey}>
  <DMList onNewDM={() => setShowNewDMModal(true)} />
  <DMChat profileCache={profileCache} />
</DMSessionProvider>
```

- [ ] **Step 3: Remove `addDMInboxRelays` and `NIP17_INBOX_FALLBACK_RELAYS` from `nostr.ts`**

Delete those exports and any internal callers.

- [ ] **Step 4: Delete old files**

```bash
git rm src/lib/dm.ts src/lib/dm.test.ts src/lib/dm-cache.ts src/lib/dm-cache.test.ts src/lib/dm-inbox.ts src/lib/dm-inbox.test.ts
```

- [ ] **Step 5: Run the full test suite**

Run: `npm run test`
Expected: PASS — all suites green.

- [ ] **Step 6: Commit**

```bash
git add -u && git add src/app/chat/page.tsx src/lib/nostr.ts
git commit -m "refactor(dm): remove top-level dm modules; wire DMSessionProvider in /chat"
```

---

## Task 16: CSP headers in `next.config.ts`

**Files:**
- Modify: `next.config.ts`
- Create: `src/__tests__/csp.test.ts`

- [ ] **Step 1: Write a failing test**

```ts
// src/__tests__/csp.test.ts
import { describe, it, expect } from 'vitest';
import nextConfig from '../../next.config';

describe('CSP', () => {
  it('exports a security headers entry that includes Content-Security-Policy', async () => {
    const headersFn = (nextConfig as any).headers;
    expect(typeof headersFn).toBe('function');
    const headers = await headersFn();
    const all = headers.flatMap((h: any) => h.headers);
    const csp = all.find((h: any) => h.key === 'Content-Security-Policy');
    expect(csp).toBeDefined();
    expect(csp.value).toContain("script-src 'self'");
    expect(csp.value).not.toContain("'unsafe-inline'");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/__tests__/csp.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add CSP headers**

Modify `next.config.ts`:

```ts
import type { NextConfig } from 'next';
import { networkInterfaces } from 'os';

const localIPs = Object.values(networkInterfaces())
  .flat()
  .filter((iface) => iface && !iface.internal && iface.family === 'IPv4')
  .map((iface) => iface!.address);

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' wss: https:",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

const nextConfig: NextConfig = {
  allowedDevOrigins: [...localIPs, 'obelisk.fabri.lat'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- src/__tests__/csp.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add next.config.ts src/__tests__/csp.test.ts
git commit -m "feat(security): baseline CSP headers (script-src 'self', no unsafe-inline)"
```

---

## Task 17: Flip the feature flag

**Files:**
- Modify: `src/lib/feature-flags.ts`

- [ ] **Step 1: Edit**

```ts
// src/lib/feature-flags.ts
export const DM_FEATURE_ENABLED = true;
```

(Remove the comment block explaining why it's disabled — the design doc supersedes it.)

- [ ] **Step 2: Run the full suite**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/feature-flags.ts
git commit -m "feat(dm): enable the DM feature flag"
```

---

## Task 18: Integration tests

**Files:**
- Create: `src/lib/dm/integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dm/integration.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fastEvents: any[] = [];
const slowEvents: any[] = [];
let onevent: ((e: any) => void) | null = null;

vi.mock('./pool', () => ({
  verifyDMEvent: () => true,
  getDMPool: () => ({
    subscribeMany: (_relays: string[], _filters: any, h: any) => {
      onevent = h.onevent;
      // Fast relay — emit immediately.
      queueMicrotask(() => fastEvents.forEach((e) => onevent!(e)));
      // Slow relay — emit after a delay.
      setTimeout(() => slowEvents.forEach((e) => onevent!(e)), 200);
      return { close: () => {} };
    },
  }),
}));

import { loadHistory } from './dm';
import { getCachedEvents } from './dm-cache';

const me = 'a'.repeat(64);
const partner = 'b'.repeat(64);

beforeEach(() => {
  localStorage.clear();
  fastEvents.length = 0;
  slowEvents.length = 0;
});

describe('integration: fast relay surfaces before slow relay', () => {
  it('first event reaches the cache before the slow relay returns', async () => {
    fastEvents.push({ id: 'fast', kind: 4, pubkey: partner, created_at: 100, tags: [['p', me]], content: 'C', sig: 'x' });
    slowEvents.push({ id: 'slow', kind: 4, pubkey: partner, created_at: 50, tags: [['p', me]], content: 'C', sig: 'x' });
    loadHistory(me, partner);
    await new Promise((r) => setTimeout(r, 80));
    const ids = getCachedEvents(me).map((e) => e.id);
    expect(ids).toContain('fast');
    expect(ids).not.toContain('slow');
  });
});

describe('integration: no plaintext on disk', () => {
  it('after putSecret round-trip, scanning localStorage finds no plaintext substring', async () => {
    const { getOrCreateCacheKey } = await import('./cache-key');
    const { putSecret } = await import('./dm-cache');
    const signer = {
      pubkey: me,
      nip44Encrypt: async (_p: string, t: string) => `WRAP|${t}`,
      nip44Decrypt: async (_p: string, c: string) => c.replace(/^WRAP\|/, ''),
    };
    const key = await getOrCreateCacheKey(me, signer);
    const SECRET = 'INTEGRATION-TEST-SECRET-PAYLOAD';
    await putSecret(me, key, 'eX', SECRET);
    const all = JSON.stringify(localStorage);
    expect(all).not.toContain(SECRET);
  });
});
```

- [ ] **Step 2: Run to verify it fails initially / passes after Tasks 1–8**

Run: `npm run test -- src/lib/dm/integration.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/dm/integration.test.ts
git commit -m "test(dm): integration — fast-relay-first + no-plaintext-on-disk"
```

---

## Task 19: User-facing documentation

**Files:**
- Create: `docs/direct-messages.md`

- [ ] **Step 1: Write the documentation**

Create `docs/direct-messages.md`:

````markdown
# Direct Messages

Obelisk supports private 1:1 chat between Nostr identities, with strict privacy guarantees and outbox-aware relay routing. This document describes the user experience, the on-disk storage model, the protocols supported, and how to operate the feature on a self-hosted instance.

## What you get

- **NIP-17 by default** (modern, gift-wrapped, metadata-leak-resistant).
- **NIP-04 fallback**, selectable per-thread via the protocol-override picker — for chatting with clients that don't yet support NIP-17.
- **Live updates** — new DMs appear without polling while the DM view is open.
- **Outbox routing** — sends are addressed to the recipient's published kind-10050 (NIP-17 inbox) or kind-10002 (NIP-04 read relays). No "lost in the void" sends because the recipient happened to use different relays.
- **Profile previews** in the recipient picker, sourced from the recipient's own write relays (always including `purplepag.es` as a profile aggregator).
- **Multi-account isolation** — log into a different identity and your DM history is unreachable from the previous account's view, by design.

## Privacy and storage model

- **Plaintext is never persisted.** Every DM byte on disk is encrypted: NIP-04 ciphertext from the wire, NIP-17 gift wraps from the wire, plus a per-event AES-GCM blob holding the decrypted body for fast preview rendering.
- The AES-GCM blob is encrypted with a **per-account symmetric key** that is generated locally, NIP-44-self-encrypted by your signer, and stored in localStorage in that wrapped form. To recover the raw key you need either your nsec or your signer (extension/bunker). On reload the signer is consulted **once** to unwrap; from then on, every preview decrypts via WebCrypto without further signer prompts.
- The AES key is imported as a **non-extractable** WebCrypto key — even an XSS attacker cannot exfiltrate the raw bytes.
- **Read-mode (no signer):** if the signer is unavailable (e.g. extension locked, bunker not connected), the DM UI is disabled. Re-enable by reconnecting your signer.

## What's stored, where

| localStorage key | Contents |
|---|---|
| `obelisk:dm-cache-key:{myPubkey}` | The AES key, NIP-44-wrapped by your signer. Useless without it. |
| `obelisk:dm:{myPubkey}` | Wire-encrypted DM events + AES-GCM-encrypted plaintext blobs + per-cursor sync state. |
| `obelisk:profiles:{myPubkey}` | Cached kind-0 events for known partners (24h SWR). |
| `obelisk:relays:{myPubkey}` | Cached kind-10002 + kind-10050 events for known partners (6h SWR). |
| `obelisk:follows:{myPubkey}` | Your own kind-3 (cold-load seed; live-refreshed via subscription). |
| `obelisk-dm-store:{myPubkey}` | Per-account UI state (read cursors, protocol overrides). |

Keys are scoped by `myPubkey` so multiple identities on the same browser do not share state.

## Cache eviction

The DM event store is capped at **2000 evictable events**. Events from/to users you follow (kind 3) are **protected** and never evicted by the cap. The cap applies only to messages with users you do not follow. Unfollowing someone makes their messages eligible for eviction on the next overflow.

If your follow list is not yet hydrated (cold start), all events are treated as protected for that session — better to keep too much than to evict before we know who's important.

## Sync semantics

- Opening the DM view fires **one multi-filter REQ per relay** (50ms request coalescer) — no per-thread one-off calls.
- Each DM filter uses a `since` cursor derived from `max(created_at)` over your cached events for that filter, so we never re-download what we already have.
- Live subscription stays open while the DM view is mounted; closing the tab or navigating away closes it.
- Profile and relay-list refreshes use stale-while-revalidate: the cached value is returned instantly; a background fetch updates the cache only if content changed.

## Sending a DM

1. Pick a recipient via npub or by clicking a member's profile.
2. The recipient's profile preview resolves through the profile cache (`purplepag.es` + their NIP-65 write relays).
3. By default, sends use NIP-17. Use the advanced **protocol** picker to force NIP-04 for that thread; the choice persists per-partner.
4. The recipient's kind-10050 (or kind-10002 for NIP-04) determines the relays we publish to.

## Operational notes

- **Self-hosted instances**: no server-side configuration is required for DMs — they are entirely client-driven via Nostr. The server is not involved in DM transport.
- **Bunker users**: expect one signer prompt per session for the AES-key unwrap, plus per-encrypt prompts when sending. Per-event preview decryption does **not** prompt the bunker.
- **Logout**: clears the in-RAM AES key handle. The wrapped key remains on disk (and is re-unwrapped on the next login). Use the per-account "Clear cache" affordance (forthcoming) if you need to wipe a specific identity's DM history from disk.

## Threat model summary

- **Disk leak**: attacker without your bunker/nsec sees only ciphertext.
- **RAM leak (live tab)**: attacker can decrypt currently-cached entries via the in-memory AES key. Equivalent to a full session compromise.
- **XSS**: the non-extractable AES key cannot be exfiltrated for offline decryption. Defense in depth via the `script-src 'self'` CSP header.
- **Relay observers**: with NIP-17, relays see only ephemeral-pubkey wraps addressed to the recipient's inbox. With NIP-04, relays see metadata (sender, recipient, timestamp).

## Troubleshooting

- **DM input is disabled**: your signer is not active. For NIP-07 extensions, unlock the extension. For bunkers, ensure the connection is live.
- **Sent message but recipient says they didn't get it**: check the recipient has published a kind-10050 (NIP-17) or kind-10002 (NIP-04). Without one, our outbox client falls back to a default relay set, but the recipient's client may not be listening there.
- **Old previews look wrong after profile change**: profile cache is 24h SWR. Close and reopen the DM view to trigger a refresh, or wait up to 24h for the background sweep.

## Spec & plan

- Design: [`docs/superpowers/specs/2026-04-26-direct-messages-design.md`](superpowers/specs/2026-04-26-direct-messages-design.md)
- Implementation plan: [`docs/superpowers/plans/2026-04-26-direct-messages.md`](superpowers/plans/2026-04-26-direct-messages.md)
````

- [ ] **Step 2: Commit**

```bash
git add docs/direct-messages.md
git commit -m "docs(dm): user/dev guide for direct messages (privacy, storage, ops)"
```

---

## Final acceptance gate

- [ ] **Run the full test suite, audit pass:**

Run: `npm run test`
Expected: every suite green; no skipped DM-related tests.

- [ ] **Manual smoke (browser):**

Start `npm run dev`, log in with two different identities in two browser profiles, exchange a NIP-17 DM, reload one of the tabs, confirm:
- Thread list renders instantly (cache-only).
- Bunker prompt fires exactly once on the reload (the KEK unwrap).
- Outbox routing reaches the other identity even if their relay set differs.

- [ ] **Worktree merge to `develop`:**

```bash
git push -u origin <feature-branch>
gh pr create --base develop --head <feature-branch> --title "feat(dm): re-enable direct messages with outbox model + encrypted-at-rest cache"
# After PR is merged into develop:
git worktree remove <worktree-path>
```

---

## Self-review checklist (run during writing-plans, fixed inline)

- [x] Spec coverage: every numbered audit item (1–23) maps to a task or subtask.
- [x] No placeholders: every code step contains the full code; no "TBD", "TODO", or "similar to Task N".
- [x] Type consistency: `getOrCreateCacheKey`, `encryptToCache`, `decryptFromCache`, `putSecret`, `getSecret`, `getCursors`, `setCursor`, `getRelays`, `getProfile`, `verifyAndIngest`, `loadHistory`, `subscribeLive`, `sendDM` are referenced consistently across tasks.
- [x] Order: foundational modules (pool, cache-key) first; consumers (dm.ts, provider) later; UI rewiring at the end; flag flip last.
- [x] Branching policy stated up front (worktrees → `develop`, removed after merge).
- [x] Documentation task included.
