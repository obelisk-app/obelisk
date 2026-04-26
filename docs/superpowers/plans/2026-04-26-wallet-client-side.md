# Wallet — Quick Setup + Full Client-Side Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship a one-click "Quick Setup" Lightning wallet flow against `https://zaps.nostr-wot.com` AND migrate every wallet credential and NWC operation off the server into the user's browser, AND brand the wallet UI with "Powered by nostr-wot". After this plan lands, the Obelisk server holds no wallet credentials and can never call NWC on a user's behalf.

**Architecture:** Three converging local-write paths (Quick Setup, manual NWC paste, manual LNbits) all land in `localStorage['obelisk:wallet:<pubkey>']` encrypted with the existing DM cache key. A `useLocalWallet()` React hook memoizes a `@getalby/sdk` `NWCClient` from the decrypted URI. Existing server-side wallets get a one-time auto-migration on next chat-page mount. Public-invoice payment in chat splits race-protection (server) from the actual NWC call (client) via a 3-step claim/pay/confirm protocol.

**Tech Stack:** Next.js 16, TypeScript, `@getalby/sdk` 7 (NWC client), `nostr-tools` (NIP-98 event signing), Vitest + RTL. No DB schema changes (the `Wallet` table is left empty for one release; dropped in a follow-up migration).

**Spec:** `docs/superpowers/specs/2026-04-26-wallet-client-side-design.md`

**Phase ordering (must be respected):**
1. **Phase A** — Pure libraries land first. No consumer changes.
2. **Phase C** — New server endpoints land additively (legacy-export, zap-receipt, invoices/pay claim+confirm).
3. **Phase B** — WalletPanel rewrite (depends on A + C).
4. **Phase D** — Chat surfaces migrated to local-client (depends on A + C; B can be in flight).
5. **Phase E** — Delete old server-side wallet endpoints, `nwc.ts`, `crypto.ts`. Only after D lands.

---

## File Structure

### New files
```
src/lib/nip98.ts
src/lib/nip98.test.ts
src/lib/wallet/provisioning.ts
src/lib/wallet/provisioning.test.ts
src/lib/wallet/local-store.ts
src/lib/wallet/local-store.test.ts
src/lib/wallet/local-client.ts
src/lib/wallet/local-client.test.tsx
src/lib/wallet/lnurl-pay.ts
src/lib/wallet/lnurl-pay.test.ts
src/lib/wallet/lnbits-to-nwc.ts
src/lib/wallet/lnbits-to-nwc.test.ts
src/components/wallet/PoweredByNostrWot.tsx
src/components/wallet/PoweredByNostrWot.test.tsx
src/app/api/wallet/legacy-export/route.ts
src/app/api/wallet/legacy-export/route.test.ts
src/app/api/wallet/zap-receipt/route.ts
src/app/api/wallet/zap-receipt/route.test.ts
src/app/api/invoices/pay/claim/route.ts
src/app/api/invoices/pay/claim/route.test.ts
src/app/api/invoices/pay/confirm/route.ts
src/app/api/invoices/pay/confirm/route.test.ts
public/nostr-wot-logo.svg                   (or text fallback)
```

### Modified files
```
src/components/wallet/WalletPanel.tsx       (full rewrite)
src/components/chat/MessageInput.tsx        (zap + invoice + balance via local-client)
src/components/chat/ZapPickerModal.tsx      (local-client + lnurl-pay)
src/components/chat/[zap-toast component]   (add <PoweredByNostrWot />)
.env.production.example                     (remove NWC_ENCRYPTION_KEY)
DEPLOY.md                                   (remove NWC_ENCRYPTION_KEY)
```

### Deleted files (Phase E)
```
src/lib/nwc.ts
src/lib/nwc.test.ts (if exists)
src/lib/crypto.ts
src/lib/crypto.test.ts
src/app/api/wallet/route.ts + .test.ts
src/app/api/wallet/balance/route.ts + .test.ts
src/app/api/wallet/pay/route.ts + .test.ts
src/app/api/wallet/invoice/route.ts + .test.ts
src/app/api/wallet/zap/route.ts + .test.ts
src/app/api/invoices/pay/route.ts + .test.ts (replaced by claim/confirm)
```

---

# PHASE A — Pure Libraries

Six independent modules. Tasks A1, A3, A4, A5, A6 can run fully in parallel. A2 depends on A1.

---

## Task A1: NIP-98 signer envelope

**Files:**
- Create: `src/lib/nip98.ts`
- Test: `src/lib/nip98.test.ts`

NIP-98 (kind 27235) HTTP auth events have three required tags: `u` (URL), `method` (HTTP verb), and the challenge in `content`. The `Signer` interface mirrors what the existing `KEKSigner` and NDK signers expose.

- [ ] **Step 1: Write failing test**

```ts
// src/lib/nip98.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildNip98Event, type Nip98Signer } from './nip98';

const fakeSigner: Nip98Signer = {
  getPublicKey: vi.fn().mockResolvedValue('npub_pub'),
  signEvent: vi.fn().mockImplementation(async (template) => ({
    ...template,
    pubkey: 'npub_pub',
    id: 'evt_id',
    sig: 'sig_hex',
    created_at: template.created_at ?? Math.floor(Date.now() / 1000),
  })),
};

describe('buildNip98Event', () => {
  it('produces a kind 27235 event with u + method tags and challenge content', async () => {
    const ev = await buildNip98Event(fakeSigner, 'https://x.test/api/foo', 'POST', 'CHAL_HEX');
    expect(ev.kind).toBe(27235);
    expect(ev.content).toBe('CHAL_HEX');
    const tagsByName = Object.fromEntries(ev.tags.map(([k, v]) => [k, v]));
    expect(tagsByName.u).toBe('https://x.test/api/foo');
    expect(tagsByName.method).toBe('POST');
    expect(ev.pubkey).toBe('npub_pub');
    expect(ev.sig).toBe('sig_hex');
  });

  it('uses the provided created_at if present in template, else current time', async () => {
    const before = Math.floor(Date.now() / 1000);
    const ev = await buildNip98Event(fakeSigner, 'https://x.test/api/foo', 'GET', 'C');
    expect(ev.created_at).toBeGreaterThanOrEqual(before);
  });

  it('forwards the URL and method exactly (no normalization)', async () => {
    const ev = await buildNip98Event(fakeSigner, 'https://x.test/api/Foo?q=1', 'PUT', 'C');
    const tagsByName = Object.fromEntries(ev.tags.map(([k, v]) => [k, v]));
    expect(tagsByName.u).toBe('https://x.test/api/Foo?q=1');
    expect(tagsByName.method).toBe('PUT');
  });
});
```

- [ ] **Step 2: Verify test fails**

```bash
cd <worktree> && npx vitest run src/lib/nip98.test.ts 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/nip98.ts
// Pure builder for NIP-98 (kind 27235) HTTP auth events. Used by the wallet
// provisioning flow against zaps.nostr-wot.com — the server-side proxy
// verifies the signature before creating wallets / claiming addresses.

export interface Nip98EventTemplate {
  kind: 27235;
  created_at: number;
  tags: string[][];
  content: string;
}

export interface Nip98SignedEvent extends Nip98EventTemplate {
  pubkey: string;
  id: string;
  sig: string;
}

export interface Nip98Signer {
  getPublicKey(): Promise<string>;
  signEvent(template: Nip98EventTemplate): Promise<Nip98SignedEvent>;
}

export async function buildNip98Event(
  signer: Nip98Signer,
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  challenge: string,
): Promise<Nip98SignedEvent> {
  const template: Nip98EventTemplate = {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', url],
      ['method', method],
    ],
    content: challenge,
  };
  return signer.signEvent(template);
}
```

- [ ] **Step 4: Run test**

```bash
cd <worktree> && npx vitest run src/lib/nip98.test.ts 2>&1 | tail -10
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
cd <worktree> && git add src/lib/nip98.ts src/lib/nip98.test.ts && \
  git commit -m "feat(wallet): NIP-98 event builder for zaps.nostr-wot.com auth

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task A2: Provisioning client (depends on A1)

**Files:**
- Create: `src/lib/wallet/provisioning.ts`
- Test: `src/lib/wallet/provisioning.test.ts`

Mirrors the extension's `lib/wallet/lnbits-provision.ts` (read for reference: `/Users/dandelionlabs/development/personal/nostr-wot-extension/lib/wallet/lnbits-provision.ts`). Default URL hardcoded per spec Q4.

- [ ] **Step 1: Write failing test**

```ts
// src/lib/wallet/provisioning.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PROVISION_URL,
  provisionWallet,
  claimLightningAddress,
  getLightningAddress,
  releaseLightningAddress,
} from './provisioning';
import type { Nip98Signer } from '../nip98';

const fakeSigner: Nip98Signer = {
  getPublicKey: vi.fn().mockResolvedValue('e9b14b3c...'),
  signEvent: vi.fn().mockImplementation(async (t) => ({
    ...t,
    pubkey: 'e9b14b3c...',
    id: 'evt_id',
    sig: 'sig_hex',
  })),
};

beforeEach(() => {
  vi.resetAllMocks();
  (fakeSigner.getPublicKey as any).mockResolvedValue('e9b14b3c...');
  (fakeSigner.signEvent as any).mockImplementation(async (t: any) => ({
    ...t,
    pubkey: 'e9b14b3c...',
    id: 'evt_id',
    sig: 'sig_hex',
  }));
  globalThis.fetch = vi.fn();
});

describe('PROVISION_URL', () => {
  it('defaults to https://zaps.nostr-wot.com', () => {
    expect(PROVISION_URL).toBe('https://zaps.nostr-wot.com');
  });
});

describe('provisionWallet', () => {
  it('GETs challenge, signs, POSTs with event, returns nwcUri', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ challenge: 'CHAL' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'w1', adminkey: 'AK', user: 'u1', balance_msat: 0, name: 'WoT:npub_test', inkey: 'ik', nwcUri: 'nostr+walletconnect://test' }),
      });
    const res = await provisionWallet(fakeSigner);
    expect(res.nwcUri).toBe('nostr+walletconnect://test');
    expect((globalThis.fetch as any).mock.calls[0][0]).toBe('https://zaps.nostr-wot.com/api/provision/challenge');
    const postCall = (globalThis.fetch as any).mock.calls[1];
    expect(postCall[0]).toBe('https://zaps.nostr-wot.com/api/provision');
    const body = JSON.parse(postCall[1].body);
    expect(body.event.kind).toBe(27235);
    expect(body.event.content).toBe('CHAL');
    expect(body.name).toMatch(/^WoT:/);
  });

  it('throws on challenge fetch failure', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, status: 502 });
    await expect(provisionWallet(fakeSigner)).rejects.toThrow(/challenge/i);
  });

  it('throws on provision POST failure with server message if present', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ challenge: 'CHAL' }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'limit_exceeded' }) });
    await expect(provisionWallet(fakeSigner)).rejects.toThrow(/limit_exceeded|provision/i);
  });
});

describe('claimLightningAddress', () => {
  it('POSTs username + signed event, returns address', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ challenge: 'C' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ address: 'alice@zaps.nostr-wot.com' }) });
    const r = await claimLightningAddress(fakeSigner, 'alice');
    expect(r.address).toBe('alice@zaps.nostr-wot.com');
    const body = JSON.parse((globalThis.fetch as any).mock.calls[1][1].body);
    expect(body.username).toBe('alice');
    expect(body.event.kind).toBe(27235);
  });

  it('surfaces server-side error message on conflict', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ challenge: 'C' }) })
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: 'already_taken' }) });
    await expect(claimLightningAddress(fakeSigner, 'alice')).rejects.toThrow(/already_taken|claim/i);
  });
});

describe('getLightningAddress', () => {
  it('returns address on hit', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ address: 'alice@zaps.nostr-wot.com' }) });
    expect(await getLightningAddress('npub_alice')).toBe('alice@zaps.nostr-wot.com');
  });
  it('returns null on miss', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: false });
    expect(await getLightningAddress('npub_alice')).toBeNull();
  });
});

describe('releaseLightningAddress', () => {
  it('signs and POSTs, resolves on success', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ challenge: 'C' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    await expect(releaseLightningAddress(fakeSigner)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Verify fails**

```bash
cd <worktree> && npx vitest run src/lib/wallet/provisioning.test.ts 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/wallet/provisioning.ts
// Quick-Setup wallet provisioning against zaps.nostr-wot.com. Mirrors the
// nostr-wot browser extension's flow: GET challenge → sign as NIP-98 →
// POST. Returns an NWC URI ready to use.

import { buildNip98Event, type Nip98Signer } from '../nip98';

export const PROVISION_URL = 'https://zaps.nostr-wot.com';

export interface ProvisionResult {
  nwcUri: string;
  walletId: string;
  adminKey: string;
}

async function getChallenge(): Promise<string> {
  const res = await fetch(`${PROVISION_URL}/api/provision/challenge`);
  if (!res.ok) throw new Error(`challenge request failed: ${res.status}`);
  const body = (await res.json()) as { challenge: string };
  return body.challenge;
}

async function authedPost(
  signer: Nip98Signer,
  endpoint: string,
  extraBody: Record<string, unknown> = {},
): Promise<unknown> {
  const challenge = await getChallenge();
  const url = `${PROVISION_URL}${endpoint}`;
  const event = await buildNip98Event(signer, url, 'POST', challenge);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, ...extraBody }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({} as Record<string, unknown>));
    const msg = (errBody as { error?: string }).error ?? `request failed: ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

export async function provisionWallet(signer: Nip98Signer): Promise<ProvisionResult> {
  const npub = await signer.getPublicKey();
  const walletName = `WoT:${npub.slice(0, 16)}`;
  const data = (await authedPost(signer, '/api/provision', { name: walletName })) as {
    id: string;
    adminkey: string;
    nwcUri?: string;
  };
  if (!data.nwcUri) {
    throw new Error('provisioning succeeded but nwcUri missing in response');
  }
  return { nwcUri: data.nwcUri, walletId: data.id, adminKey: data.adminkey };
}

export async function claimLightningAddress(
  signer: Nip98Signer,
  username: string,
): Promise<{ address: string }> {
  return authedPost(signer, '/api/claim-username', { username }) as Promise<{ address: string }>;
}

export async function getLightningAddress(pubkey: string): Promise<string | null> {
  const res = await fetch(`${PROVISION_URL}/api/lightning-address?pubkey=${encodeURIComponent(pubkey)}`);
  if (!res.ok) return null;
  const body = (await res.json()) as { address: string | null };
  return body.address;
}

export async function releaseLightningAddress(signer: Nip98Signer): Promise<void> {
  await authedPost(signer, '/api/release-username');
}
```

- [ ] **Step 4: Run test**

```bash
cd <worktree> && npx vitest run src/lib/wallet/provisioning.test.ts 2>&1 | tail -15
```

Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
cd <worktree> && git add src/lib/wallet/provisioning.ts src/lib/wallet/provisioning.test.ts && \
  git commit -m "feat(wallet): provisioning client for zaps.nostr-wot.com

Quick Setup + Lightning Address claim/release/lookup using NIP-98 auth.
Default URL hardcoded to https://zaps.nostr-wot.com per spec Q4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task A3: Local store (encrypted with DM cache key)

**Files:**
- Create: `src/lib/wallet/local-store.ts`
- Test: `src/lib/wallet/local-store.test.ts`

Read `src/lib/dm/cache-key.ts` first to understand the existing helpers — your store reuses `getOrCreateCacheKey`, `encryptToCache`, `decryptFromCache`.

- [ ] **Step 1: Write failing test**

```ts
// src/lib/wallet/local-store.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { _resetCacheKeyState } from '@/lib/dm/cache-key';
import {
  saveLocalWallet, readLocalWallet, clearLocalWallet, hasLocalWallet,
  type LocalWallet,
} from './local-store';

const PUBKEY = 'npub_test_user';

const fakeSigner = {
  pubkey: PUBKEY,
  nip44Encrypt: vi.fn(async (_recipient: string, plaintext: string) => `wrapped:${plaintext}`),
  nip44Decrypt: vi.fn(async (_sender: string, ciphertext: string) =>
    ciphertext.startsWith('wrapped:') ? ciphertext.slice(8) : '',
  ),
};

beforeEach(() => {
  _resetCacheKeyState();
  globalThis.localStorage.clear();
});

describe('local-store', () => {
  it('round-trips a wallet (save → read)', async () => {
    const wallet: LocalWallet = {
      source: 'quick',
      nwcUri: 'nostr+walletconnect://abc',
      label: 'nostr-wot',
    };
    await saveLocalWallet(PUBKEY, fakeSigner, wallet);
    expect(hasLocalWallet(PUBKEY)).toBe(true);
    const loaded = await readLocalWallet(PUBKEY, fakeSigner);
    expect(loaded).toEqual(wallet);
  });

  it('readLocalWallet returns null when nothing stored', async () => {
    expect(await readLocalWallet(PUBKEY, fakeSigner)).toBeNull();
    expect(hasLocalWallet(PUBKEY)).toBe(false);
  });

  it('clearLocalWallet removes entry', async () => {
    await saveLocalWallet(PUBKEY, fakeSigner, { source: 'nwc', nwcUri: 'nostr+walletconnect://x' });
    await clearLocalWallet(PUBKEY);
    expect(hasLocalWallet(PUBKEY)).toBe(false);
    expect(await readLocalWallet(PUBKEY, fakeSigner)).toBeNull();
  });

  it('isolates wallets per pubkey', async () => {
    await saveLocalWallet(PUBKEY, fakeSigner, { source: 'quick', nwcUri: 'A' });
    await saveLocalWallet('npub_other', { ...fakeSigner, pubkey: 'npub_other' } as any, { source: 'nwc', nwcUri: 'B' });
    const a = await readLocalWallet(PUBKEY, fakeSigner);
    expect(a?.nwcUri).toBe('A');
  });

  it('preserves all LocalWallet fields including lnbitsInstance', async () => {
    const wallet: LocalWallet = {
      source: 'lnbits',
      nwcUri: 'nostr+walletconnect://lnbits-converted',
      label: 'My LNbits',
      lnbitsInstance: 'https://my.lnbits.test',
    };
    await saveLocalWallet(PUBKEY, fakeSigner, wallet);
    const loaded = await readLocalWallet(PUBKEY, fakeSigner);
    expect(loaded).toEqual(wallet);
  });
});
```

- [ ] **Step 2: Verify fails**

```bash
cd <worktree> && npx vitest run src/lib/wallet/local-store.test.ts 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/wallet/local-store.ts
// Per-account local wallet store. The NWC URI is encrypted with the user's
// DM cache key (random 32 bytes wrapped via NIP-44 self-encrypt). Server
// never sees plaintext credentials.

import { getOrCreateCacheKey, encryptToCache, decryptFromCache, type KEKSigner } from '@/lib/dm/cache-key';

export type WalletSource = 'quick' | 'nwc' | 'lnbits';

export interface LocalWallet {
  source: WalletSource;
  nwcUri: string;
  label?: string;
  lnbitsInstance?: string;
}

const STORAGE_PREFIX = 'obelisk:wallet:';

const keyFor = (pubkey: string): string => `${STORAGE_PREFIX}${pubkey}`;

export function hasLocalWallet(pubkey: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(keyFor(pubkey)) !== null;
}

export async function saveLocalWallet(
  pubkey: string,
  signer: KEKSigner,
  wallet: LocalWallet,
): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  const key = await getOrCreateCacheKey(pubkey, signer);
  const blob = await encryptToCache(key, JSON.stringify(wallet));
  localStorage.setItem(keyFor(pubkey), blob);
}

export async function readLocalWallet(
  pubkey: string,
  signer: KEKSigner,
): Promise<LocalWallet | null> {
  if (typeof localStorage === 'undefined') return null;
  const blob = localStorage.getItem(keyFor(pubkey));
  if (!blob) return null;
  const key = await getOrCreateCacheKey(pubkey, signer);
  const json = await decryptFromCache(key, blob);
  return JSON.parse(json) as LocalWallet;
}

export async function clearLocalWallet(pubkey: string): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(keyFor(pubkey));
}
```

- [ ] **Step 4: Run test**

```bash
cd <worktree> && npx vitest run src/lib/wallet/local-store.test.ts 2>&1 | tail -10
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
cd <worktree> && git add src/lib/wallet/local-store.ts src/lib/wallet/local-store.test.ts && \
  git commit -m "feat(wallet): local-store encrypted with DM cache key

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task A4: LNURL-pay client

**Files:**
- Create: `src/lib/wallet/lnurl-pay.ts`
- Test: `src/lib/wallet/lnurl-pay.test.ts`

Resolves a Lightning Address (e.g. `alice@zaps.nostr-wot.com`) via LNURL-pay (LUD-16). Returns the payParams or invoice. Used to zap another user without their interaction.

- [ ] **Step 1: Write failing test**

```ts
// src/lib/wallet/lnurl-pay.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveLightningAddress, requestInvoice } from './lnurl-pay';

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe('resolveLightningAddress', () => {
  it('resolves alice@host to https://host/.well-known/lnurlp/alice', async () => {
    const params = {
      callback: 'https://host/lnurlp/cb',
      minSendable: 1000,
      maxSendable: 10_000_000_000,
      tag: 'payRequest',
      metadata: '[]',
    };
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => params });
    const r = await resolveLightningAddress('alice@host');
    expect((globalThis.fetch as any).mock.calls[0][0]).toBe('https://host/.well-known/lnurlp/alice');
    expect(r).toEqual(params);
  });

  it('throws on malformed address (no @)', async () => {
    await expect(resolveLightningAddress('alicehost')).rejects.toThrow(/lightning address/i);
  });

  it('throws on http error', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(resolveLightningAddress('alice@host')).rejects.toThrow(/lnurl/i);
  });
});

describe('requestInvoice', () => {
  it('GETs callback?amount=<msat> and returns invoice', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pr: 'lnbc100u...', routes: [] }),
    });
    const r = await requestInvoice('https://host/cb', 100_000);
    expect((globalThis.fetch as any).mock.calls[0][0]).toBe('https://host/cb?amount=100000');
    expect(r.invoice).toBe('lnbc100u...');
  });

  it('forwards optional comment as &comment=...', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ pr: 'lnbc...' }) });
    await requestInvoice('https://host/cb', 1000, 'gracias');
    expect((globalThis.fetch as any).mock.calls[0][0]).toContain('amount=1000');
    expect((globalThis.fetch as any).mock.calls[0][0]).toContain('comment=gracias');
  });

  it('forwards optional zap-request nostr event as &nostr=<encoded>', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ pr: 'lnbc...' }) });
    const zapReq = { kind: 9734, tags: [], content: '', pubkey: 'pk', sig: 's', id: 'i', created_at: 1 };
    await requestInvoice('https://host/cb', 1000, undefined, zapReq);
    const url = (globalThis.fetch as any).mock.calls[0][0];
    expect(url).toContain('nostr=');
  });

  it('throws if response has no invoice', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ERROR', reason: 'no liquidity' }) });
    await expect(requestInvoice('https://host/cb', 1000)).rejects.toThrow(/no liquidity|invoice/i);
  });
});
```

- [ ] **Step 2: Verify fails**

```bash
cd <worktree> && npx vitest run src/lib/wallet/lnurl-pay.test.ts 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/wallet/lnurl-pay.ts
// LNURL-pay (LUD-16) resolver: turn a Lightning Address into a callback URL,
// then request a BOLT11 invoice for a given amount. Used to zap another
// user without requiring them to be online.

export interface LnurlPayParams {
  callback: string;
  minSendable: number;     // millisatoshis
  maxSendable: number;     // millisatoshis
  tag: 'payRequest';
  metadata: string;        // JSON string per spec
  allowsNostr?: boolean;
  nostrPubkey?: string;
}

export interface InvoiceResponse {
  invoice: string;
  raw: unknown;
}

export async function resolveLightningAddress(address: string): Promise<LnurlPayParams> {
  const at = address.indexOf('@');
  if (at <= 0 || at === address.length - 1) {
    throw new Error('invalid lightning address');
  }
  const username = address.slice(0, at);
  const host = address.slice(at + 1);
  const url = `https://${host}/.well-known/lnurlp/${username}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`lnurl resolution failed: ${res.status}`);
  return (await res.json()) as LnurlPayParams;
}

export async function requestInvoice(
  callback: string,
  amountMsat: number,
  comment?: string,
  zapRequest?: unknown,
): Promise<InvoiceResponse> {
  const params = new URLSearchParams({ amount: String(amountMsat) });
  if (comment) params.set('comment', comment);
  if (zapRequest) params.set('nostr', JSON.stringify(zapRequest));
  const sep = callback.includes('?') ? '&' : '?';
  const url = `${callback}${sep}${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`invoice request failed: ${res.status}`);
  const body = (await res.json()) as { pr?: string; status?: string; reason?: string };
  if (!body.pr) throw new Error(body.reason ?? 'no invoice in response');
  return { invoice: body.pr, raw: body };
}
```

- [ ] **Step 4: Run test**

```bash
cd <worktree> && npx vitest run src/lib/wallet/lnurl-pay.test.ts 2>&1 | tail -10
```

Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
cd <worktree> && git add src/lib/wallet/lnurl-pay.ts src/lib/wallet/lnurl-pay.test.ts && \
  git commit -m "feat(wallet): LNURL-pay client for zapping other users

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task A5: LNbits → NWC URI converter

**Files:**
- Create: `src/lib/wallet/lnbits-to-nwc.ts`
- Test: `src/lib/wallet/lnbits-to-nwc.test.ts`

Most LNbits instances expose a built-in NWC service plugin (e.g. `/nostrwalletconnect`). When the user pastes their LNbits URL + admin key, we hit that endpoint to get back an NWC URI we can store.

- [ ] **Step 1: Write failing test**

```ts
// src/lib/wallet/lnbits-to-nwc.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { lnbitsToNwc } from './lnbits-to-nwc';

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe('lnbitsToNwc', () => {
  it('GETs the NWC plugin endpoint with the admin key and returns nwcUri', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ uri: 'nostr+walletconnect://abc?relay=wss%3A%2F%2Fr&secret=def' }),
    });
    const r = await lnbitsToNwc('https://lnbits.example', 'admin_key_xyz');
    expect(r.nwcUri).toBe('nostr+walletconnect://abc?relay=wss%3A%2F%2Fr&secret=def');
    const callUrl = (globalThis.fetch as any).mock.calls[0][0];
    expect(callUrl).toContain('lnbits.example');
    const headers = (globalThis.fetch as any).mock.calls[0][1].headers;
    expect(headers['X-Api-Key']).toBe('admin_key_xyz');
  });

  it('strips trailing slashes from instanceUrl', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ uri: 'nostr+walletconnect://x' }) });
    await lnbitsToNwc('https://lnbits.example///', 'k');
    const callUrl = (globalThis.fetch as any).mock.calls[0][0];
    expect(callUrl.startsWith('https://lnbits.example/')).toBe(true);
    expect(callUrl).not.toContain('//api');
  });

  it('throws with friendly message if the NWC plugin is not enabled (404)', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(lnbitsToNwc('https://lnbits.example', 'k')).rejects.toThrow(/nwc plugin/i);
  });

  it('throws on auth failure (401)', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(lnbitsToNwc('https://lnbits.example', 'bad')).rejects.toThrow(/admin key|auth/i);
  });

  it('rejects empty inputs', async () => {
    await expect(lnbitsToNwc('', 'k')).rejects.toThrow(/url/i);
    await expect(lnbitsToNwc('https://x', '')).rejects.toThrow(/admin key/i);
  });
});
```

- [ ] **Step 2: Verify fails**

```bash
cd <worktree> && npx vitest run src/lib/wallet/lnbits-to-nwc.test.ts 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/wallet/lnbits-to-nwc.ts
// Convert LNbits credentials (instance URL + admin key) into an NWC URI.
// Most LNbits installs expose the built-in NWC service plugin which mints
// connection URIs.

export interface LnbitsToNwcResult {
  nwcUri: string;
}

export async function lnbitsToNwc(
  instanceUrl: string,
  adminKey: string,
): Promise<LnbitsToNwcResult> {
  if (!instanceUrl?.trim()) throw new Error('LNbits URL is required');
  if (!adminKey?.trim()) throw new Error('LNbits admin key is required');
  const base = instanceUrl.trim().replace(/\/+$/, '');
  // The NWC service plugin path on LNbits.
  const url = `${base}/nostrwalletconnect/api/v1/pairing`;
  const res = await fetch(url, {
    headers: { 'X-Api-Key': adminKey.trim(), 'Content-Type': 'application/json' },
  });
  if (res.status === 404) throw new Error('LNbits NWC plugin not enabled on this instance');
  if (res.status === 401 || res.status === 403) throw new Error('Invalid LNbits admin key');
  if (!res.ok) throw new Error(`LNbits returned ${res.status}`);
  const body = (await res.json()) as { uri?: string };
  if (!body.uri) throw new Error('LNbits NWC response missing uri');
  return { nwcUri: body.uri };
}
```

> **Note:** The exact LNbits NWC endpoint path varies by version. If the smoke test reveals a different path (e.g. `/nostrwalletconnect/api/v1/connections`), adjust here. The test above isolates the path so it's an easy single-line fix.

- [ ] **Step 4: Run test**

```bash
cd <worktree> && npx vitest run src/lib/wallet/lnbits-to-nwc.test.ts 2>&1 | tail -10
```

Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
cd <worktree> && git add src/lib/wallet/lnbits-to-nwc.ts src/lib/wallet/lnbits-to-nwc.test.ts && \
  git commit -m "feat(wallet): LNbits → NWC URI converter

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task A6: PoweredByNostrWot component + logo asset

**Files:**
- Create: `src/components/wallet/PoweredByNostrWot.tsx`
- Create: `src/components/wallet/PoweredByNostrWot.test.tsx`
- Create: `public/nostr-wot-logo.svg` (copy from extension; if missing, fall back to text-only render)

- [ ] **Step 1: Try to copy the SVG logo**

```bash
ls /Users/dandelionlabs/development/personal/nostr-wot-extension/icons/ 2>&1 | head -10
```

Pick the smallest SVG that has the wordmark or icon (likely something like `icon.svg` or `logo.svg`). Copy it to `<worktree>/public/nostr-wot-logo.svg`. If no SVG exists, skip this step — the component falls back to text-only.

```bash
cp /Users/dandelionlabs/development/personal/nostr-wot-extension/icons/<svg-file> <worktree>/public/nostr-wot-logo.svg 2>/dev/null || echo "No SVG found, will use text fallback"
```

- [ ] **Step 2: Write failing test**

```tsx
// src/components/wallet/PoweredByNostrWot.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PoweredByNostrWot } from './PoweredByNostrWot';

describe('PoweredByNostrWot', () => {
  it('renders a link to https://nostr-wot.com with rel="noopener noreferrer"', () => {
    render(<PoweredByNostrWot />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://nostr-wot.com');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('contains the "nostr-wot" text', () => {
    render(<PoweredByNostrWot />);
    expect(screen.getByText(/nostr-wot/i)).toBeInTheDocument();
  });

  it('contains the "Powered by" text', () => {
    render(<PoweredByNostrWot />);
    expect(screen.getByText(/Powered by/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Verify fails**

```bash
cd <worktree> && npx vitest run src/components/wallet/PoweredByNostrWot.test.tsx 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 4: Implement**

```tsx
// src/components/wallet/PoweredByNostrWot.tsx
'use client';

/**
 * "Powered by nostr-wot" attribution legend. Mounted on every wallet
 * surface (connect screen, connected view, send/receive confirmations,
 * zap toast). Links to the nostr-wot project page.
 */
export function PoweredByNostrWot() {
  return (
    <a
      href="https://nostr-wot.com"
      target="_blank"
      rel="noopener noreferrer"
      className="text-[10px] text-lc-muted hover:text-lc-white inline-flex items-center gap-1 mt-2"
    >
      ⚡ Powered by
      <img
        src="/nostr-wot-logo.svg"
        alt=""
        className="h-3"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
      nostr-wot
    </a>
  );
}
```

- [ ] **Step 5: Run test**

```bash
cd <worktree> && npx vitest run src/components/wallet/PoweredByNostrWot.test.tsx 2>&1 | tail -10
```

Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
cd <worktree> && git add src/components/wallet/PoweredByNostrWot.tsx src/components/wallet/PoweredByNostrWot.test.tsx public/nostr-wot-logo.svg 2>/dev/null; \
  cd <worktree> && git add src/components/wallet/PoweredByNostrWot.tsx src/components/wallet/PoweredByNostrWot.test.tsx && \
  git commit -m "feat(wallet): PoweredByNostrWot attribution component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# PHASE C — Server-Side New Endpoints (Additive)

These land in parallel with Phase B. Old endpoints stay alive — Phase E removes them after consumers migrate.

---

## Task C1: GET /api/wallet/legacy-export

**Files:**
- Create: `src/app/api/wallet/legacy-export/route.ts`
- Test: `src/app/api/wallet/legacy-export/route.test.ts`

One-shot per user. Returns the existing `Wallet` row's NWC URI and **deletes the row in the same DB transaction**. Returns 404 when there's nothing to migrate.

- [ ] **Step 1: Write failing test**

```ts
// src/app/api/wallet/legacy-export/route.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: any) => fn({
      wallet: {
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
    })),
  },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));
vi.mock('@/lib/crypto', () => ({ decrypt: vi.fn((s: string) => s.replace('enc:', '')) }));

import { GET } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const PUBKEY = 'npub_test';

beforeEach(() => {
  vi.resetAllMocks();
  (getAuthPubkey as any).mockResolvedValue(PUBKEY);
});

const makeReq = () => new NextRequest('http://x/api/wallet/legacy-export');

describe('GET /api/wallet/legacy-export', () => {
  it('returns the URI and deletes the row on first call', async () => {
    let walletDeleted = false;
    (prisma.$transaction as any).mockImplementation(async (fn: any) => fn({
      wallet: {
        findUnique: vi.fn().mockResolvedValue({ pubkey: PUBKEY, nwcUrlEncrypted: 'enc:nostr+walletconnect://x', label: 'Alby' }),
        delete: vi.fn().mockImplementation(() => { walletDeleted = true; return {}; }),
      },
    }));
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ nwcUri: 'nostr+walletconnect://x', label: 'Alby' });
    expect(walletDeleted).toBe(true);
  });

  it('returns 404 when no wallet exists (already migrated)', async () => {
    (prisma.$transaction as any).mockImplementation(async (fn: any) => fn({
      wallet: {
        findUnique: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
      },
    }));
    const res = await GET(makeReq());
    expect(res.status).toBe(404);
  });

  it('401 when no session', async () => {
    (getAuthPubkey as any).mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Verify fails**

```bash
cd <worktree> && npx vitest run src/app/api/wallet/legacy-export/route.test.ts 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/app/api/wallet/legacy-export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { decrypt } from '@/lib/crypto';

export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const exported = await prisma.$transaction(async (tx) => {
    const w = await tx.wallet.findUnique({ where: { pubkey } });
    if (!w) return null;
    await tx.wallet.delete({ where: { pubkey } });
    return { nwcUri: decrypt(w.nwcUrlEncrypted), label: (w as { label?: string | null }).label ?? null };
  });

  if (!exported) return NextResponse.json({ error: 'no_wallet' }, { status: 404 });
  return NextResponse.json(exported);
}
```

- [ ] **Step 4: Run test**

```bash
cd <worktree> && npx vitest run src/app/api/wallet/legacy-export/route.test.ts 2>&1 | tail -10
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
cd <worktree> && git add src/app/api/wallet/legacy-export/route.ts src/app/api/wallet/legacy-export/route.test.ts && \
  git commit -m "feat(wallet): one-shot legacy-export endpoint for client-side migration

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task C2: POST /api/wallet/zap-receipt

**Files:**
- Create: `src/app/api/wallet/zap-receipt/route.ts`
- Test: `src/app/api/wallet/zap-receipt/route.test.ts`

Audit-log only. Records a zap that already happened client-side. No NWC calls, no credentials. Optionally emits a socket event so the recipient sees it live.

- [ ] **Step 1: Inspect the existing zap database/socket model**

```bash
grep -rn "model.*Zap\|prisma.zap\|ZapReceived\|InvoicePaid" /Users/dandelionlabs/development/personal/obelisk/prisma/schema.prisma /Users/dandelionlabs/development/personal/obelisk/src/lib/socket-events.ts 2>&1 | head -10
```

If a `Zap` model exists, use it. If not, persist as an `InvoicePayment` row with `kind='zap'` (or skip persistence in v1 — just emit the socket event). The test below assumes a thin record; adjust to whatever the schema actually has.

- [ ] **Step 2: Write failing test**

```ts
// src/app/api/wallet/zap-receipt/route.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    zap: { create: vi.fn() },
  },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));
vi.mock('@/server/api-bridge', () => ({ getIO: vi.fn(() => ({ to: () => ({ emit: vi.fn() }) })) }));

import { POST } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const PAYER = 'npub_payer';

beforeEach(() => {
  vi.resetAllMocks();
  (getAuthPubkey as any).mockResolvedValue(PAYER);
});

const makeReq = (body: unknown) => new NextRequest('http://x/api/wallet/zap-receipt', {
  method: 'POST',
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json' },
});

describe('POST /api/wallet/zap-receipt', () => {
  it('records a zap with all fields', async () => {
    (prisma.zap.create as any).mockResolvedValue({ id: 'z1' });
    const res = await POST(makeReq({
      targetPubkey: 'npub_target',
      amountMsat: 1_000_000,
      channelId: 'ch1',
      messageId: 'm1',
      paymentHash: 'ph_hex',
    }));
    expect(res.status).toBe(200);
    expect(prisma.zap.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payerPubkey: PAYER,
        targetPubkey: 'npub_target',
        amountMsat: 1_000_000,
        paymentHash: 'ph_hex',
      }),
    });
  });

  it('rejects missing required fields', async () => {
    const res = await POST(makeReq({ targetPubkey: 'x' })); // missing amountMsat + paymentHash
    expect(res.status).toBe(400);
  });

  it('401 when no session', async () => {
    (getAuthPubkey as any).mockResolvedValue(null);
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: Verify fails + check schema for `Zap` model**

```bash
cd <worktree> && npx vitest run src/app/api/wallet/zap-receipt/route.test.ts 2>&1 | tail -10
grep -A5 "^model Zap" prisma/schema.prisma 2>&1 | head -20
```

If `Zap` model does not exist, **add a migration** in this task:

```bash
cat <<'EOF' > prisma/migrations/$(date +%Y%m%d%H%M%S)_add_zap_log/migration.sql
CREATE TABLE "Zap" (
  "id" TEXT PRIMARY KEY,
  "payerPubkey" TEXT NOT NULL,
  "targetPubkey" TEXT NOT NULL,
  "amountMsat" BIGINT NOT NULL,
  "channelId" TEXT,
  "messageId" TEXT,
  "paymentHash" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Zap_targetPubkey_createdAt_idx" ON "Zap"("targetPubkey", "createdAt");
CREATE INDEX "Zap_messageId_idx" ON "Zap"("messageId");
EOF
```

And add to `prisma/schema.prisma`:

```prisma
model Zap {
  id            String   @id @default(cuid())
  payerPubkey   String
  targetPubkey  String
  amountMsat    BigInt
  channelId     String?
  messageId     String?
  paymentHash   String   @unique
  createdAt     DateTime @default(now())

  @@index([targetPubkey, createdAt])
  @@index([messageId])
}
```

Run `npx prisma generate && npx prisma migrate dev --name add_zap_log` if you have a local dev DB; otherwise `npx prisma generate` is enough to update the client.

- [ ] **Step 4: Implement the route**

```ts
// src/app/api/wallet/zap-receipt/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { getIO } from '@/server/api-bridge';

export async function POST(req: NextRequest) {
  const payer = await getAuthPubkey(req);
  if (!payer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { targetPubkey, amountMsat, channelId, messageId, paymentHash } = body as {
    targetPubkey?: string;
    amountMsat?: number;
    channelId?: string;
    messageId?: string;
    paymentHash?: string;
  };
  if (!targetPubkey || typeof targetPubkey !== 'string') return NextResponse.json({ error: 'invalid target' }, { status: 400 });
  if (typeof amountMsat !== 'number' || amountMsat <= 0) return NextResponse.json({ error: 'invalid amount' }, { status: 400 });
  if (!paymentHash || typeof paymentHash !== 'string') return NextResponse.json({ error: 'invalid paymentHash' }, { status: 400 });

  const zap = await prisma.zap.create({
    data: {
      payerPubkey: payer,
      targetPubkey,
      amountMsat: BigInt(amountMsat),
      channelId: channelId ?? null,
      messageId: messageId ?? null,
      paymentHash,
    },
  });

  // Best-effort live notification (target room may not be connected).
  try {
    getIO().to(`pubkey:${targetPubkey}`).emit('ZapReceived', {
      payerPubkey: payer,
      amountMsat,
      channelId: channelId ?? null,
      messageId: messageId ?? null,
      paymentHash,
      at: zap.createdAt,
    });
  } catch {
    // socket bridge may not be initialized in test runs — non-fatal
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run tests**

```bash
cd <worktree> && npx vitest run src/app/api/wallet/zap-receipt/route.test.ts 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd <worktree> && git add prisma/schema.prisma prisma/migrations/ src/app/api/wallet/zap-receipt/route.ts src/app/api/wallet/zap-receipt/route.test.ts && \
  git commit -m "feat(wallet): zap-receipt audit log endpoint + Zap model

Records zaps that already happened client-side via local NWC. No funds
movement; no credentials. Emits ZapReceived for live sidebar updates.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task C3: POST /api/invoices/pay/claim + /confirm

**Files:**
- Create: `src/app/api/invoices/pay/claim/route.ts`
- Create: `src/app/api/invoices/pay/claim/route.test.ts`
- Create: `src/app/api/invoices/pay/confirm/route.ts`
- Create: `src/app/api/invoices/pay/confirm/route.test.ts`

Splits the existing `POST /api/invoices/pay` race-protection from the actual NWC call. The race-protection lock stays server-side; the NWC call moves client-side.

The existing `InvoicePayment` model already has the `paymentHash` unique constraint. Read the existing route for context first:

```bash
cat /Users/dandelionlabs/development/personal/obelisk/src/app/api/invoices/pay/route.ts
```

- [ ] **Step 1: Write failing tests for claim**

```ts
// src/app/api/invoices/pay/claim/route.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: { invoicePayment: { create: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() } },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));
vi.mock('@/lib/bolt11', () => ({ parseBolt11: vi.fn() }));

import { POST } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { parseBolt11 } from '@/lib/bolt11';

const PAYER = 'npub_payer';

beforeEach(() => {
  vi.resetAllMocks();
  (getAuthPubkey as any).mockResolvedValue(PAYER);
  (parseBolt11 as any).mockReturnValue({ paymentHash: 'ph_hex', expiresAt: Math.floor(Date.now() / 1000) + 3600 });
});

const makeReq = (body: unknown) => new NextRequest('http://x/api/invoices/pay/claim', {
  method: 'POST',
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json' },
});

describe('POST /api/invoices/pay/claim', () => {
  it('first payer wins', async () => {
    (prisma.invoicePayment.create as any).mockResolvedValue({ id: 'ip1', paymentHash: 'ph_hex' });
    (prisma.invoicePayment.deleteMany as any).mockResolvedValue({ count: 0 });
    const res = await POST(makeReq({ invoice: 'lnbc...' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.paymentHash).toBe('ph_hex');
  });

  it('subsequent payer loses with already_paid or pending', async () => {
    (prisma.invoicePayment.deleteMany as any).mockResolvedValue({ count: 0 });
    const err = Object.assign(new Error('Unique violation'), { code: 'P2002' });
    (prisma.invoicePayment.create as any).mockRejectedValue(err);
    (prisma.invoicePayment.findUnique as any).mockResolvedValue({ paymentHash: 'ph_hex', status: 'pending', payerPubkey: 'other' });
    const res = await POST(makeReq({ invoice: 'lnbc...' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/pending/);
  });

  it('rejects expired invoice', async () => {
    (parseBolt11 as any).mockReturnValue({ paymentHash: 'ph_hex', expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const res = await POST(makeReq({ invoice: 'lnbc...' }));
    expect(res.status).toBe(400);
  });

  it('401 when no session', async () => {
    (getAuthPubkey as any).mockResolvedValue(null);
    const res = await POST(makeReq({ invoice: 'lnbc...' }));
    expect(res.status).toBe(401);
  });

  it('sweeps stale pending rows (>30s) before attempting claim', async () => {
    (prisma.invoicePayment.deleteMany as any).mockResolvedValue({ count: 1 });
    (prisma.invoicePayment.create as any).mockResolvedValue({ id: 'ip1', paymentHash: 'ph_hex' });
    const res = await POST(makeReq({ invoice: 'lnbc...' }));
    expect(prisma.invoicePayment.deleteMany).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Write failing tests for confirm**

```ts
// src/app/api/invoices/pay/confirm/route.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: { invoicePayment: { update: vi.fn(), delete: vi.fn(), findUnique: vi.fn() } },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));
vi.mock('@/server/api-bridge', () => ({ getIO: vi.fn(() => ({ to: () => ({ emit: vi.fn() }), emit: vi.fn() })) }));

import { POST } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const PAYER = 'npub_payer';

beforeEach(() => {
  vi.resetAllMocks();
  (getAuthPubkey as any).mockResolvedValue(PAYER);
});

const makeReq = (body: unknown) => new NextRequest('http://x/api/invoices/pay/confirm', {
  method: 'POST',
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json' },
});

describe('POST /api/invoices/pay/confirm', () => {
  it('marks paid and emits InvoicePaid', async () => {
    (prisma.invoicePayment.findUnique as any).mockResolvedValue({ paymentHash: 'ph', payerPubkey: PAYER, status: 'pending', channelId: 'ch1', messageId: 'm1' });
    (prisma.invoicePayment.update as any).mockResolvedValue({});
    const res = await POST(makeReq({ paymentHash: 'ph', status: 'paid', preimage: 'pim' }));
    expect(res.status).toBe(200);
    expect(prisma.invoicePayment.update).toHaveBeenCalled();
  });

  it('deletes the row on failed status to allow retry', async () => {
    (prisma.invoicePayment.findUnique as any).mockResolvedValue({ paymentHash: 'ph', payerPubkey: PAYER, status: 'pending' });
    (prisma.invoicePayment.delete as any).mockResolvedValue({});
    const res = await POST(makeReq({ paymentHash: 'ph', status: 'failed' }));
    expect(res.status).toBe(200);
    expect(prisma.invoicePayment.delete).toHaveBeenCalled();
  });

  it('rejects confirm from a different payer', async () => {
    (prisma.invoicePayment.findUnique as any).mockResolvedValue({ paymentHash: 'ph', payerPubkey: 'other', status: 'pending' });
    const res = await POST(makeReq({ paymentHash: 'ph', status: 'paid' }));
    expect(res.status).toBe(403);
  });

  it('404 for unknown paymentHash', async () => {
    (prisma.invoicePayment.findUnique as any).mockResolvedValue(null);
    const res = await POST(makeReq({ paymentHash: 'unknown', status: 'paid' }));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Verify both fail**

```bash
cd <worktree> && npx vitest run src/app/api/invoices/pay/claim/route.test.ts src/app/api/invoices/pay/confirm/route.test.ts 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 4: Inspect existing InvoicePayment model**

```bash
grep -A8 "model InvoicePayment" /Users/dandelionlabs/development/personal/obelisk/prisma/schema.prisma
```

If the model does not have a `status` field, **add a migration**:

```sql
ALTER TABLE "InvoicePayment" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'paid';
```

(Default `paid` because every existing row is by definition already-paid under the old flow.)

And update the schema:

```prisma
model InvoicePayment {
  // ... existing fields
  status      String   @default("paid")  // 'pending' | 'paid' | 'failed'
}
```

- [ ] **Step 5: Implement claim route**

```ts
// src/app/api/invoices/pay/claim/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { parseBolt11 } from '@/lib/bolt11';

const PENDING_SWEEP_MS = 30_000;

export async function POST(req: NextRequest) {
  const payer = await getAuthPubkey(req);
  if (!payer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const invoice = (body as { invoice?: string }).invoice;
  const channelId = (body as { channelId?: string }).channelId;
  const messageId = (body as { messageId?: string }).messageId;
  if (!invoice || typeof invoice !== 'string' || !/^ln(bc|tb|bcrt)/i.test(invoice)) {
    return NextResponse.json({ error: 'invalid_invoice' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseBolt11(invoice);
  } catch {
    return NextResponse.json({ error: 'invalid_invoice' }, { status: 400 });
  }
  const now = Math.floor(Date.now() / 1000);
  if (parsed.expiresAt && parsed.expiresAt < now) {
    return NextResponse.json({ error: 'expired' }, { status: 400 });
  }

  // Sweep stale pending rows so a crashed payer doesn't permanently block.
  await prisma.invoicePayment.deleteMany({
    where: { status: 'pending', createdAt: { lt: new Date(Date.now() - PENDING_SWEEP_MS) } },
  });

  try {
    await prisma.invoicePayment.create({
      data: {
        paymentHash: parsed.paymentHash,
        payerPubkey: payer,
        amountMsat: parsed.amountMsat ?? 0,
        channelId: channelId ?? null,
        messageId: messageId ?? null,
        status: 'pending',
      },
    });
    return NextResponse.json({ ok: true, paymentHash: parsed.paymentHash });
  } catch (err) {
    // Unique violation on paymentHash → someone already claimed.
    if ((err as { code?: string }).code === 'P2002') {
      const existing = await prisma.invoicePayment.findUnique({ where: { paymentHash: parsed.paymentHash } });
      const status = existing?.status === 'paid' ? 'already_paid' : 'pending';
      return NextResponse.json({ error: status }, { status: 409 });
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Implement confirm route**

```ts
// src/app/api/invoices/pay/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { getIO } from '@/server/api-bridge';

export async function POST(req: NextRequest) {
  const payer = await getAuthPubkey(req);
  if (!payer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { paymentHash, status, preimage } = body as {
    paymentHash?: string;
    status?: 'paid' | 'failed';
    preimage?: string;
  };
  if (!paymentHash || (status !== 'paid' && status !== 'failed')) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const row = await prisma.invoicePayment.findUnique({ where: { paymentHash } });
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (row.payerPubkey !== payer) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  if (status === 'failed') {
    await prisma.invoicePayment.delete({ where: { paymentHash } });
    return NextResponse.json({ ok: true });
  }

  await prisma.invoicePayment.update({
    where: { paymentHash },
    data: { status: 'paid', preimage: preimage ?? null },
  });

  // Emit InvoicePaid for the channel so others see it cleared.
  try {
    if (row.channelId) {
      getIO().to(`channel:${row.channelId}`).emit('InvoicePaid', {
        paymentHash,
        payerPubkey: payer,
        messageId: row.messageId,
      });
    }
  } catch {
    // bridge not bound (test mode) — non-fatal
  }

  return NextResponse.json({ ok: true });
}
```

> **Note:** If `InvoicePayment` doesn't have a `preimage` column, either add one in the migration above or drop `preimage` from the update. `preimage` is useful for proof-of-payment but not strictly required.

- [ ] **Step 7: Run tests**

```bash
cd <worktree> && npx vitest run src/app/api/invoices/pay/claim/route.test.ts src/app/api/invoices/pay/confirm/route.test.ts 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd <worktree> && git add prisma/ src/app/api/invoices/pay/claim/ src/app/api/invoices/pay/confirm/ && \
  git commit -m "feat(wallet): split invoice-pay into server claim + client pay + server confirm

Server keeps race-protection (first claimer wins on paymentHash) but the
actual NWC payInvoice call moves client-side. 30s pending sweep allows
retries if a paying client crashes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# PHASE B — useLocalWallet Hook + WalletPanel Rewrite

## Task B1: useLocalWallet hook

**Files:**
- Create: `src/lib/wallet/local-client.ts`
- Test: `src/lib/wallet/local-client.test.tsx`

Returns `{ client, loading, error, reload, disconnect }`. The hook reads from `local-store`, decrypts the URI via the user's signer, and instantiates `NWCClient` once per session (memoized).

The signer comes from the existing auth flow — we need to access `KEKSigner` (the same one DM cache uses). Inspect first:

```bash
grep -rn "KEKSigner\|getKEKSigner\|useKEKSigner" /Users/dandelionlabs/development/personal/obelisk/src 2>/dev/null | grep -v test | head -10
```

If there's a hook (e.g. `useKEKSigner`), use it. Otherwise the signer is built from `useAuthStore`'s active signer; you build it locally in this hook.

- [ ] **Step 1: Write failing test**

```tsx
// src/lib/wallet/local-client.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/wallet/local-store', () => ({
  hasLocalWallet: vi.fn(),
  readLocalWallet: vi.fn(),
  clearLocalWallet: vi.fn(),
}));
vi.mock('@getalby/sdk', () => ({
  NWCClient: vi.fn().mockImplementation((opts) => ({
    nostrWalletConnectUrl: opts.nostrWalletConnectUrl,
    close: vi.fn(),
  })),
}));

const fakeSigner = {
  pubkey: 'npub_me',
  nip44Encrypt: async () => 'enc',
  nip44Decrypt: async () => 'dec',
};

import { useLocalWallet } from './local-client';
import * as store from '@/lib/wallet/local-store';

describe('useLocalWallet', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('returns null client when no wallet stored', async () => {
    (store.hasLocalWallet as any).mockReturnValue(false);
    const { result } = renderHook(() => useLocalWallet('npub_me', fakeSigner));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.client).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('decrypts and instantiates NWCClient when wallet exists', async () => {
    (store.hasLocalWallet as any).mockReturnValue(true);
    (store.readLocalWallet as any).mockResolvedValue({ source: 'quick', nwcUri: 'nostr+walletconnect://test' });
    const { result } = renderHook(() => useLocalWallet('npub_me', fakeSigner));
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(result.current.client).not.toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('disconnect clears the local wallet and resets client', async () => {
    (store.hasLocalWallet as any).mockReturnValueOnce(true).mockReturnValue(false);
    (store.readLocalWallet as any).mockResolvedValue({ source: 'quick', nwcUri: 'nostr+walletconnect://test' });
    const { result } = renderHook(() => useLocalWallet('npub_me', fakeSigner));
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    await act(async () => { await result.current.disconnect(); });
    expect(store.clearLocalWallet).toHaveBeenCalledWith('npub_me');
    expect(result.current.client).toBeNull();
  });
});
```

- [ ] **Step 2: Verify fails**

```bash
cd <worktree> && npx vitest run src/lib/wallet/local-client.test.tsx 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/wallet/local-client.ts
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { NWCClient } from '@getalby/sdk';
import { hasLocalWallet, readLocalWallet, clearLocalWallet } from './local-store';
import type { KEKSigner } from '@/lib/dm/cache-key';

export interface UseLocalWalletResult {
  client: NWCClient | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useLocalWallet(
  pubkey: string | null,
  signer: KEKSigner | null,
): UseLocalWalletResult {
  const [client, setClient] = useState<NWCClient | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<NWCClient | null>(null);

  const reload = useCallback(async () => {
    if (!pubkey || !signer) {
      setClient(null);
      return;
    }
    if (!hasLocalWallet(pubkey)) {
      setClient(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const wallet = await readLocalWallet(pubkey, signer);
      if (!wallet) {
        setClient(null);
        return;
      }
      // Close previous client if rotating.
      if (clientRef.current) {
        try { clientRef.current.close?.(); } catch { /* ignore */ }
      }
      const c = new NWCClient({ nostrWalletConnectUrl: wallet.nwcUri });
      clientRef.current = c;
      setClient(c);
    } catch (e) {
      setError((e as Error).message);
      setClient(null);
    } finally {
      setLoading(false);
    }
  }, [pubkey, signer]);

  const disconnect = useCallback(async () => {
    if (!pubkey) return;
    if (clientRef.current) {
      try { clientRef.current.close?.(); } catch { /* ignore */ }
      clientRef.current = null;
    }
    await clearLocalWallet(pubkey);
    setClient(null);
  }, [pubkey]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => () => {
    if (clientRef.current) {
      try { clientRef.current.close?.(); } catch { /* ignore */ }
    }
  }, []);

  return { client, loading, error, reload, disconnect };
}
```

- [ ] **Step 4: Run test**

```bash
cd <worktree> && npx vitest run src/lib/wallet/local-client.test.tsx 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd <worktree> && git add src/lib/wallet/local-client.ts src/lib/wallet/local-client.test.tsx && \
  git commit -m "feat(wallet): useLocalWallet hook memoizing NWCClient from local store

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B2: WalletPanel rewrite — three-tab connect + LN address + auto-migration + local-only ops

**Files:**
- Modify: `src/components/wallet/WalletPanel.tsx`
- Test: `src/components/wallet/WalletPanel.test.tsx` (create or update)

This is the largest single component change. It replaces the entire current connect flow and the entire current connected-view fetches. Open the existing file first to learn the layout vocabulary (`lc-card`, `lc-pill-primary`, etc.).

Because the component is ~250 lines and the rewrite is a near-total replacement, the simplest approach is to delete and rewrite, preserving the imports and overall section structure. Below is the full new file.

- [ ] **Step 1: Read the existing component**

```bash
cat /Users/dandelionlabs/development/personal/obelisk/src/components/wallet/WalletPanel.tsx
```

Note the design tokens used (`lc-card`, `lc-pill-primary`, `lc-pill-secondary`, `lc-spinner`, `lc-green`, `lc-muted`, etc.) and the i18n style (Spanish copy strings). Match them in the rewrite.

- [ ] **Step 2: Write the test scaffold**

```tsx
// src/components/wallet/WalletPanel.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import WalletPanel from './WalletPanel';

vi.mock('@/lib/wallet/local-store', () => ({
  hasLocalWallet: vi.fn(),
  readLocalWallet: vi.fn(),
  saveLocalWallet: vi.fn(),
  clearLocalWallet: vi.fn(),
}));
vi.mock('@/lib/wallet/local-client', () => ({
  useLocalWallet: vi.fn(() => ({ client: null, loading: false, error: null, reload: vi.fn(), disconnect: vi.fn() })),
}));
vi.mock('@/lib/wallet/provisioning', () => ({
  provisionWallet: vi.fn(),
  claimLightningAddress: vi.fn(),
  getLightningAddress: vi.fn(),
  releaseLightningAddress: vi.fn(),
  PROVISION_URL: 'https://zaps.nostr-wot.com',
}));
vi.mock('@/lib/wallet/lnbits-to-nwc', () => ({ lnbitsToNwc: vi.fn() }));

// Mock auth store + KEK signer source
vi.mock('@/store/auth', () => ({
  useAuthStore: vi.fn(() => ({ profile: { pubkey: 'npub_me' } })),
}));

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }); // legacy-export 404
});

describe('WalletPanel', () => {
  it('renders three connect tabs when no wallet exists', async () => {
    const { hasLocalWallet } = await import('@/lib/wallet/local-store');
    (hasLocalWallet as any).mockReturnValue(false);
    render(<WalletPanel />);
    await waitFor(() => {
      expect(screen.getByText(/Quick Setup/i)).toBeInTheDocument();
      expect(screen.getByText(/^NWC$/)).toBeInTheDocument();
      expect(screen.getByText(/LNbits/)).toBeInTheDocument();
    });
  });

  it('Quick Setup tab → click "Crear billetera" calls provisionWallet then saveLocalWallet', async () => {
    const { hasLocalWallet, saveLocalWallet } = await import('@/lib/wallet/local-store');
    const { provisionWallet } = await import('@/lib/wallet/provisioning');
    (hasLocalWallet as any).mockReturnValue(false);
    (provisionWallet as any).mockResolvedValue({ nwcUri: 'nostr+walletconnect://abc', walletId: 'w1', adminKey: 'ak' });
    render(<WalletPanel />);
    await waitFor(() => screen.getByText(/Crear billetera/i));
    fireEvent.click(screen.getByText(/Crear billetera/i));
    await waitFor(() => {
      expect(provisionWallet).toHaveBeenCalled();
      expect(saveLocalWallet).toHaveBeenCalled();
    });
  });

  it('auto-migration on mount: hits legacy-export and saves locally', async () => {
    const { hasLocalWallet, saveLocalWallet } = await import('@/lib/wallet/local-store');
    (hasLocalWallet as any).mockReturnValue(false);
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ nwcUri: 'nostr+walletconnect://migrated', label: 'Alby' }),
    });
    render(<WalletPanel />);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/wallet/legacy-export');
      expect(saveLocalWallet).toHaveBeenCalled();
    });
  });

  it('renders <PoweredByNostrWot /> on the connect screen', async () => {
    const { hasLocalWallet } = await import('@/lib/wallet/local-store');
    (hasLocalWallet as any).mockReturnValue(false);
    render(<WalletPanel />);
    await waitFor(() => {
      expect(screen.getByText(/Powered by/i)).toBeInTheDocument();
      expect(screen.getByText(/nostr-wot/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 3: Verify the test fails**

```bash
cd <worktree> && npx vitest run src/components/wallet/WalletPanel.test.tsx 2>&1 | tail -15
```

Expected: FAIL — the component does not yet have the new behavior.

- [ ] **Step 4: Replace the component**

Overwrite `src/components/wallet/WalletPanel.tsx` with the version below. **Read the existing copy carefully** before applying — preserve the design tokens and any i18n strings the project uses. Adjust the signer-source helper to whatever the codebase actually exposes (the plan uses `useAuthStore` + a builder; if the project has a `useKEKSigner` hook, use that instead).

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useLocalWallet } from '@/lib/wallet/local-client';
import {
  hasLocalWallet,
  saveLocalWallet,
} from '@/lib/wallet/local-store';
import {
  provisionWallet,
  claimLightningAddress,
  getLightningAddress,
  releaseLightningAddress,
} from '@/lib/wallet/provisioning';
import { lnbitsToNwc } from '@/lib/wallet/lnbits-to-nwc';
import { PoweredByNostrWot } from './PoweredByNostrWot';
import type { KEKSigner } from '@/lib/dm/cache-key';

type Tab = 'quick' | 'nwc' | 'lnbits';
type View = 'main' | 'send' | 'receive';

/**
 * Build a KEKSigner from the project's auth store. The auth store exposes
 * the active NDK signer; we adapt it to the KEKSigner interface (pubkey,
 * nip44 encrypt/decrypt). If the codebase already exposes a hook for this,
 * use that — verify with `grep -rn "useKEKSigner\|getKEKSigner" src/`.
 */
function useKEKSigner(): KEKSigner | null {
  const profile = useAuthStore((s) => s.profile);
  // The exact adapter depends on the auth store's signer surface.
  // Replace this stub with the real adapter (likely already exists or one
  // line away from existing code in src/lib/dm/dm.ts).
  if (!profile?.pubkey) return null;
  return {
    pubkey: profile.pubkey,
    nip44Encrypt: async (recipient, pt) => {
      // Defer to whatever the project uses (NDK signer's nip44Encrypt etc.)
      throw new Error('TODO: adapter — implementer wires this from existing signer surface');
    },
    nip44Decrypt: async (sender, ct) => {
      throw new Error('TODO: adapter — implementer wires this from existing signer surface');
    },
  };
}

export default function WalletPanel() {
  const profile = useAuthStore((s) => s.profile);
  const pubkey = profile?.pubkey ?? null;
  const signer = useKEKSigner();
  const { client, reload, disconnect } = useLocalWallet(pubkey, signer);

  const [tab, setTab] = useState<Tab>('quick');
  const [busy, setBusy] = useState<boolean>(false);
  const [view, setView] = useState<View>('main');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // NWC paste form state
  const [nwcUrl, setNwcUrl] = useState<string>('');
  const [label, setLabel] = useState<string>('');

  // LNbits form state
  const [lnbitsUrl, setLnbitsUrl] = useState<string>('');
  const [lnbitsKey, setLnbitsKey] = useState<string>('');

  // Connected view state
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState<boolean>(false);
  const [lnAddress, setLnAddress] = useState<string | null>(null);
  const [claimUsername, setClaimUsername] = useState<string>('');

  // Send / receive
  const [sendInvoice, setSendInvoice] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [receiveAmount, setReceiveAmount] = useState<string>('');
  const [receiveDesc, setReceiveDesc] = useState<string>('');
  const [generatedInvoice, setGeneratedInvoice] = useState<string | null>(null);
  const { copy: copyToClipboard } = useCopyToClipboard();

  // ─── Auto-migration on mount ────────────────────────────────────────
  useEffect(() => {
    if (!pubkey || !signer) return;
    if (hasLocalWallet(pubkey)) return;
    void (async () => {
      try {
        const res = await fetch('/api/wallet/legacy-export');
        if (!res.ok) return;
        const body = await res.json();
        if (body.nwcUri) {
          await saveLocalWallet(pubkey, signer, {
            source: 'nwc',
            nwcUri: body.nwcUri,
            label: body.label ?? 'Migrated',
          });
          await reload();
        }
      } catch { /* non-fatal */ }
    })();
  }, [pubkey, signer, reload]);

  // ─── Balance polling when connected ─────────────────────────────────
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    setBalanceLoading(true);
    (async () => {
      try {
        const r = await client.getBalance();
        if (!cancelled) setBalance(Math.floor((r.balance ?? 0) / 1000));
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [client]);

  // ─── LN address lookup when connected ───────────────────────────────
  useEffect(() => {
    if (!pubkey || !client) return;
    void (async () => {
      const addr = await getLightningAddress(pubkey).catch(() => null);
      setLnAddress(addr);
    })();
  }, [pubkey, client]);

  const handleQuickSetup = async () => {
    if (!signer || !pubkey) return;
    setBusy(true); setStatus(null); setError(null);
    try {
      const { nwcUri } = await provisionWallet(signer);
      await saveLocalWallet(pubkey, signer, { source: 'quick', nwcUri, label: 'nostr-wot' });
      await reload();
      setStatus('Wallet conectada');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const handleNwcConnect = async () => {
    if (!signer || !pubkey) return;
    if (!nwcUrl.trim().startsWith('nostr+walletconnect://')) {
      setError('Esa URL no parece un Nostr Wallet Connect URI');
      return;
    }
    setBusy(true); setStatus(null); setError(null);
    try {
      await saveLocalWallet(pubkey, signer, {
        source: 'nwc',
        nwcUri: nwcUrl.trim(),
        label: label.trim() || undefined,
      });
      await reload();
      setNwcUrl(''); setLabel('');
      setStatus('Wallet conectada');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const handleLnbitsConnect = async () => {
    if (!signer || !pubkey) return;
    setBusy(true); setStatus(null); setError(null);
    try {
      const { nwcUri } = await lnbitsToNwc(lnbitsUrl, lnbitsKey);
      await saveLocalWallet(pubkey, signer, {
        source: 'lnbits',
        nwcUri,
        lnbitsInstance: lnbitsUrl.trim().replace(/\/+$/, ''),
        label: 'LNbits',
      });
      await reload();
      setLnbitsUrl(''); setLnbitsKey('');
      setStatus('Wallet conectada');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const handleDisconnect = async () => {
    if (!confirm('¿Desconectar la wallet?')) return;
    await disconnect();
    setBalance(null); setLnAddress(null); setView('main');
  };

  const handleClaimAddress = async () => {
    if (!signer || !claimUsername.trim()) return;
    setBusy(true); setError(null);
    try {
      const { address } = await claimLightningAddress(signer, claimUsername.trim());
      setLnAddress(address);
      setClaimUsername('');
      setStatus(`Reclamaste ${address}`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const handleReleaseAddress = async () => {
    if (!signer) return;
    if (!confirm('¿Liberar tu Lightning Address?')) return;
    setBusy(true); setError(null);
    try {
      await releaseLightningAddress(signer);
      setLnAddress(null);
      setStatus('Dirección liberada');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const handleSend = async () => {
    if (!client || !sendInvoice.trim()) return;
    setSending(true); setError(null);
    try {
      await client.payInvoice({ invoice: sendInvoice.trim() });
      setSendInvoice('');
      setStatus('Pago enviado');
      // Refresh balance
      const b = await client.getBalance();
      setBalance(Math.floor((b.balance ?? 0) / 1000));
      setView('main');
    } catch (e) { setError((e as Error).message); }
    finally { setSending(false); }
  };

  const handleReceive = async () => {
    if (!client) return;
    const amt = Number(receiveAmount);
    if (!amt || amt <= 0) return;
    setBusy(true); setError(null);
    try {
      const inv = await client.makeInvoice({ amount: amt * 1000, description: receiveDesc || undefined });
      setGeneratedInvoice(inv.invoice);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  // ─── Render ─────────────────────────────────────────────────────────
  if (!pubkey) {
    return <div className="lc-card p-4 text-sm text-lc-muted">Iniciá sesión para usar la wallet</div>;
  }

  if (!client) {
    return (
      <section className="lc-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-lc-white">⚡ Conectar wallet</h2>
        </div>
        <div className="flex gap-2 mb-4 border-b border-lc-border">
          {(['quick', 'nwc', 'lnbits'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(null); setStatus(null); }}
              className={`px-3 py-1.5 text-xs ${tab === t ? 'text-lc-green border-b-2 border-lc-green' : 'text-lc-muted hover:text-lc-white'}`}
            >
              {t === 'quick' ? 'Quick Setup' : t === 'nwc' ? 'NWC' : 'LNbits'}
            </button>
          ))}
        </div>
        {tab === 'quick' && (
          <div className="space-y-3">
            <p className="text-xs text-lc-muted">
              Crea una billetera Lightning con un click. Sin registro — se autentica con tu identidad Nostr.
            </p>
            <button onClick={handleQuickSetup} disabled={busy} className="lc-pill-primary text-xs disabled:opacity-50">
              {busy ? 'Creando...' : 'Crear billetera'}
            </button>
          </div>
        )}
        {tab === 'nwc' && (
          <div className="space-y-3">
            <input value={nwcUrl} onChange={(e) => setNwcUrl(e.target.value)} placeholder="nostr+walletconnect://..."
              className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green" />
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Etiqueta (opcional)"
              className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green" />
            <button onClick={handleNwcConnect} disabled={busy || !nwcUrl} className="lc-pill-primary text-xs disabled:opacity-50">
              {busy ? 'Conectando...' : 'Conectar'}
            </button>
          </div>
        )}
        {tab === 'lnbits' && (
          <div className="space-y-3">
            <input value={lnbitsUrl} onChange={(e) => setLnbitsUrl(e.target.value)} placeholder="https://lnbits.example"
              className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green" />
            <input type="password" value={lnbitsKey} onChange={(e) => setLnbitsKey(e.target.value)} placeholder="Admin key"
              className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green" />
            <button onClick={handleLnbitsConnect} disabled={busy || !lnbitsUrl || !lnbitsKey} className="lc-pill-primary text-xs disabled:opacity-50">
              {busy ? 'Conectando...' : 'Conectar'}
            </button>
          </div>
        )}
        {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
        {status && <div className="text-xs text-lc-muted mt-2">{status}</div>}
        <PoweredByNostrWot />
      </section>
    );
  }

  // Connected view
  return (
    <>
      <section className="lc-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-lc-white">⚡ Lightning Wallet</h2>
          <button onClick={handleDisconnect} className="text-xs text-lc-muted hover:text-red-400">Desconectar</button>
        </div>
        {view === 'main' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-lc-black border border-lc-border rounded-lg px-3 py-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-lc-muted">Balance</div>
                <div className="text-lc-white text-xl font-semibold">
                  {balanceLoading ? '...' : balance !== null ? `${balance.toLocaleString()} sats` : '—'}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setView('send')} className="lc-pill-secondary text-xs">Enviar</button>
              <button onClick={() => { setView('receive'); setGeneratedInvoice(null); setReceiveAmount(''); setReceiveDesc(''); }} className="lc-pill-secondary text-xs">Recibir</button>
            </div>
            {error && <div className="text-xs text-red-400">{error}</div>}
            {status && <div className="text-xs text-lc-muted">{status}</div>}
            <PoweredByNostrWot />
          </div>
        ) : view === 'send' ? (
          <div className="space-y-3">
            <button onClick={() => setView('main')} className="text-xs text-lc-muted hover:text-lc-white">&larr; Atrás</button>
            <input value={sendInvoice} onChange={(e) => setSendInvoice(e.target.value)} placeholder="lnbc..."
              className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white font-mono outline-none focus:border-lc-green" />
            <button onClick={handleSend} disabled={sending || !sendInvoice} className="lc-pill-primary text-xs disabled:opacity-50">
              {sending ? 'Pagando...' : 'Pagar'}
            </button>
            {error && <div className="text-xs text-red-400">{error}</div>}
            <PoweredByNostrWot />
          </div>
        ) : (
          <div className="space-y-3">
            <button onClick={() => setView('main')} className="text-xs text-lc-muted hover:text-lc-white">&larr; Atrás</button>
            {generatedInvoice ? (
              <>
                <div className="bg-lc-black border border-lc-border rounded-lg p-3 text-xs font-mono text-lc-white break-all">
                  {generatedInvoice}
                </div>
                <button onClick={() => copyToClipboard(generatedInvoice)} className="lc-pill-secondary text-xs">Copiar</button>
              </>
            ) : (
              <>
                <input value={receiveAmount} onChange={(e) => setReceiveAmount(e.target.value)} placeholder="Monto en sats" type="number"
                  className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green" />
                <input value={receiveDesc} onChange={(e) => setReceiveDesc(e.target.value)} placeholder="Descripción (opcional)"
                  className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green" />
                <button onClick={handleReceive} disabled={busy || !receiveAmount} className="lc-pill-primary text-xs disabled:opacity-50">
                  {busy ? 'Generando...' : 'Generar invoice'}
                </button>
              </>
            )}
            {error && <div className="text-xs text-red-400">{error}</div>}
            <PoweredByNostrWot />
          </div>
        )}
      </section>

      {/* Lightning Address card */}
      <section className="lc-card p-4 mt-3">
        <h3 className="text-sm font-semibold text-lc-white mb-2">⚡ Dirección Lightning</h3>
        {lnAddress ? (
          <div className="flex items-center justify-between bg-lc-black border border-lc-border rounded-lg px-3 py-2">
            <span className="text-sm text-lc-white font-mono">{lnAddress}</span>
            <button onClick={handleReleaseAddress} disabled={busy} className="text-xs text-lc-muted hover:text-red-400">Cambiar</button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-lc-muted">Reclamá una dirección Lightning como `tu-nombre@zaps.nostr-wot.com`.</p>
            <div className="flex gap-2">
              <input value={claimUsername} onChange={(e) => setClaimUsername(e.target.value)} placeholder="usuario"
                className="flex-1 bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green" />
              <button onClick={handleClaimAddress} disabled={busy || !claimUsername} className="lc-pill-primary text-xs disabled:opacity-50">
                {busy ? '...' : 'Reclamar'}
              </button>
            </div>
          </div>
        )}
        <PoweredByNostrWot />
      </section>
    </>
  );
}
```

> **Critical:** the `useKEKSigner` stub above throws because the implementer needs to wire the project's actual signer surface. Before committing, replace the body with an adapter built from whatever signer the project exposes (likely accessible via `getNDK().signer` or similar — `grep -rn "ndk.signer\|getNDK" src/` to find the canonical accessor). The DM cache is already using this pattern in `src/lib/dm/dm.ts` — copy that adapter exactly.

- [ ] **Step 5: Run tests**

```bash
cd <worktree> && npx vitest run src/components/wallet/WalletPanel.test.tsx 2>&1 | tail -25
```

Expected: PASS, 4 tests.

If TypeScript errors on `client.getBalance()` etc., check the `@getalby/sdk` types — the API method names may be slightly different (`getBalance` vs `getBalanceSats`, `payInvoice` vs `payInvoiceSync`). Adjust to match the real SDK; the test uses generic names that should work with reasonable mock objects.

- [ ] **Step 6: Commit**

```bash
cd <worktree> && git add src/components/wallet/WalletPanel.tsx src/components/wallet/WalletPanel.test.tsx && \
  git commit -m "feat(wallet): three-tab connect + LN address + auto-migration + local-only ops

Replaces the prior server-fetch-driven panel with one driven by useLocalWallet.
Auto-migrates existing server-side wallets on mount via /api/wallet/legacy-export.
PoweredByNostrWot legend on every view.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# PHASE D — Chat Surfaces

## Task D1: MessageInput — zap + invoice + balance via local-client

**Files:**
- Modify: `src/components/chat/MessageInput.tsx`

The existing `MessageInput.tsx` references `/api/wallet/zap`, `/api/wallet/invoice`, `/api/wallet/balance`. Each call moves to client-side primitives.

- [ ] **Step 1: Inspect the three call sites**

```bash
grep -n "/api/wallet" /Users/dandelionlabs/development/personal/obelisk/src/components/chat/MessageInput.tsx
```

You'll see three usages around lines 297, 336, 370 (per current grep). Read 50-line slices around each to understand the surrounding handlers.

- [ ] **Step 2: Refactor each call**

For each `/api/wallet/...` fetch:

**Zap path (`/api/wallet/zap`):**

Replace the fetch with:
```ts
import { useLocalWallet } from '@/lib/wallet/local-client';
import { resolveLightningAddress, requestInvoice } from '@/lib/wallet/lnurl-pay';
// ... in component body:
const { client } = useLocalWallet(myPubkey, kekSigner);
// ... in zap handler, replacing the existing fetch:
const targetLnAddress = /* resolve from target's profile/Member */;
if (!targetLnAddress) throw new Error('Recipient has no Lightning Address');
const params = await resolveLightningAddress(targetLnAddress);
const { invoice } = await requestInvoice(params.callback, amountMsat);
const result = await client!.payInvoice({ invoice });
await fetch('/api/wallet/zap-receipt', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    targetPubkey, amountMsat, channelId, messageId,
    paymentHash: result.preimage ? /* derive paymentHash from preimage */ : undefined,
  }),
});
```

> **Note:** Deriving `paymentHash` from `preimage` requires SHA-256(preimage). Use `crypto.subtle.digest`. Or read it from the `invoice` itself via `parseBolt11` (already a project dep). Pick whichever the existing zap-receipt POST expects.

**Invoice path (`/api/wallet/invoice`):**

Replace the fetch with:
```ts
const inv = await client!.makeInvoice({ amount: amountSats * 1000, description: desc });
// inv.invoice is the BOLT11 string
```

**Balance path (`/api/wallet/balance`):**

Replace with:
```ts
const b = await client!.getBalance();
const sats = Math.floor((b.balance ?? 0) / 1000);
```

Each call needs a `client` guard: if `!client` show "Conectá una wallet" or similar.

- [ ] **Step 3: Run tests**

```bash
cd <worktree> && npm test 2>&1 | tail -30
```

Expected: existing MessageInput tests update or pass (they may need mock updates for `useLocalWallet`).

If specific tests fail because they mock `/api/wallet/...` directly, add mocks for `@/lib/wallet/local-client` and `@/lib/wallet/lnurl-pay` similar to the WalletPanel test.

- [ ] **Step 4: Commit**

```bash
cd <worktree> && git add src/components/chat/MessageInput.tsx && \
  git commit -m "feat(wallet): MessageInput zap + invoice + balance via local-client + LNURL-pay

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task D2: ZapPickerModal — local-client + lnurl-pay

**Files:**
- Modify: `src/components/chat/ZapPickerModal.tsx`

Same pattern as D1: replace `/api/wallet/invoice` and `/api/wallet/pay` with `client.makeInvoice` / `client.payInvoice`. For zapping a peer where the modal is the entry point, prefer the LNURL-pay path against the recipient's Lightning Address.

- [ ] **Step 1: Inspect**

```bash
grep -n "/api/wallet" /Users/dandelionlabs/development/personal/obelisk/src/components/chat/ZapPickerModal.tsx
```

- [ ] **Step 2: Apply the same replacements as D1.** The handler shape is similar — read each call site and convert. If the modal currently calls `/api/wallet/invoice` to mint a self-invoice and `/api/wallet/pay` to pay a peer, the new flow is just `lnurl-pay` against the peer's address + `client.payInvoice`.

- [ ] **Step 3: Run tests**

```bash
cd <worktree> && npm test 2>&1 | tail -30
```

- [ ] **Step 4: Commit**

```bash
cd <worktree> && git add src/components/chat/ZapPickerModal.tsx && \
  git commit -m "feat(wallet): ZapPickerModal — local-client + lnurl-pay

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task D3: Zap toast — add PoweredByNostrWot

**Files:**
- Modify: the zap toast component (find with `grep -rln "Zapped\|zap.*toast\|ZapToast" src/components/`)

- [ ] **Step 1: Locate the toast component**

```bash
grep -rln "Zapped\|zap.*toast\|ZapToast" /Users/dandelionlabs/development/personal/obelisk/src/components/ 2>&1 | head -5
```

If no dedicated component (toast text rendered inline in `MessageInput` or similar), add the legend at the place where the zap success message is shown.

- [ ] **Step 2: Add the import + render**

```tsx
import { PoweredByNostrWot } from '@/components/wallet/PoweredByNostrWot';
// Inside the toast JSX, at the bottom:
<PoweredByNostrWot />
```

- [ ] **Step 3: Run tests + commit**

```bash
cd <worktree> && npm test 2>&1 | tail -10
cd <worktree> && git add <toast file> && \
  git commit -m "feat(wallet): zap toast carries PoweredByNostrWot legend

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# PHASE E — Server-Side Teardown

Only after Phase D is fully merged and tests are green.

## Task E1: Refactor /api/invoices/pay consumers to use claim/confirm

**Files:**
- Modify: any client calling `POST /api/invoices/pay` (likely `MessageInput.tsx` or a "pay this invoice in chat" button)

- [ ] **Step 1: Find consumers**

```bash
grep -rn "/api/invoices/pay\b" /Users/dandelionlabs/development/personal/obelisk/src 2>&1 | grep -v test | grep -v "/claim\|/confirm" | head -10
```

- [ ] **Step 2: Refactor each call to the 3-step protocol:**

```ts
// 1. Claim
const claim = await fetch('/api/invoices/pay/claim', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ invoice, channelId, messageId }),
});
if (!claim.ok) {
  const { error } = await claim.json();
  if (error === 'pending') return alert('Alguien más está pagando este invoice');
  if (error === 'already_paid') return alert('Este invoice ya fue pagado');
  return alert('Error: ' + error);
}
const { paymentHash } = await claim.json();

// 2. Pay client-side
let preimage: string | undefined;
let payOk = false;
try {
  const result = await client!.payInvoice({ invoice });
  preimage = result.preimage;
  payOk = true;
} catch (e) {
  // pay failed
}

// 3. Confirm outcome
await fetch('/api/invoices/pay/confirm', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ paymentHash, status: payOk ? 'paid' : 'failed', preimage }),
});
```

- [ ] **Step 3: Run tests + commit**

```bash
cd <worktree> && npm test 2>&1 | tail -10
cd <worktree> && git add <files> && \
  git commit -m "feat(wallet): chat invoice-pay uses claim/confirm protocol

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task E2: Delete server-side wallet code

**Files to delete (and their tests):**
- `src/lib/nwc.ts` (+ test if present)
- `src/lib/crypto.ts` + `src/lib/crypto.test.ts`
- `src/app/api/wallet/route.ts` + tests
- `src/app/api/wallet/balance/route.ts` + tests
- `src/app/api/wallet/pay/route.ts` + tests
- `src/app/api/wallet/invoice/route.ts` + tests
- `src/app/api/wallet/zap/route.ts` + tests
- `src/app/api/invoices/pay/route.ts` + tests (replaced by claim/confirm)

- [ ] **Step 1: Verify no remaining consumers**

```bash
grep -rn "from '@/lib/nwc'\|from '@/lib/crypto'\|withClient\|/api/wallet\\b" /Users/dandelionlabs/development/personal/obelisk/src 2>&1 | grep -v test | grep -v generated | grep -v "/legacy-export\|/zap-receipt\|/claim\|/confirm" | head -10
```

Expected: empty output. If anything remains, refactor it before deleting (must not break existing surfaces).

- [ ] **Step 2: Delete the files**

```bash
cd <worktree> && \
  git rm src/lib/nwc.ts src/lib/crypto.ts src/lib/crypto.test.ts 2>/dev/null; \
  git rm src/app/api/wallet/route.ts src/app/api/wallet/route.test.ts 2>/dev/null; \
  git rm src/app/api/wallet/balance/route.ts src/app/api/wallet/balance/route.test.ts 2>/dev/null; \
  git rm src/app/api/wallet/pay/route.ts src/app/api/wallet/pay/route.test.ts 2>/dev/null; \
  git rm src/app/api/wallet/invoice/route.ts src/app/api/wallet/invoice/route.test.ts 2>/dev/null; \
  git rm src/app/api/wallet/zap/route.ts src/app/api/wallet/zap/route.test.ts 2>/dev/null; \
  git rm src/app/api/invoices/pay/route.ts src/app/api/invoices/pay/route.test.ts 2>/dev/null; \
  true
```

- [ ] **Step 3: Update env docs**

Edit `.env.production.example`: remove the `NWC_ENCRYPTION_KEY=...` line.
Edit `DEPLOY.md`: remove any mention of `NWC_ENCRYPTION_KEY`.

```bash
grep -n "NWC_ENCRYPTION_KEY" /Users/dandelionlabs/development/personal/obelisk/.env.production.example /Users/dandelionlabs/development/personal/obelisk/DEPLOY.md
```

- [ ] **Step 4: Run tests**

```bash
cd <worktree> && npx tsc --noEmit 2>&1 | tail -10
cd <worktree> && npm test 2>&1 | tail -20
```

Expected: clean TypeScript. All tests pass (the deleted-test removal is the point).

- [ ] **Step 5: Commit**

```bash
cd <worktree> && git add -A && \
  git commit -m "feat(wallet): remove server-side wallet code (nwc.ts, crypto.ts, /api/wallet/*)

After this commit the server holds no wallet credentials, has no
NWC_ENCRYPTION_KEY env var, and cannot call NWC on any user's behalf.
Public-invoice payments still go through the server but only for
race-protection (claim/confirm); the actual payInvoice happens in the
user's browser.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task E3: Final verification

- [ ] **Step 1: Full test run**

```bash
cd <worktree> && npm test 2>&1 | tail -15
```

Expected: green. Pre-existing flake on `amber-integration.test.ts` is acceptable.

- [ ] **Step 2: TypeScript build sanity**

```bash
cd <worktree> && npx tsc --noEmit 2>&1 | head -10
```

Expected: clean.

- [ ] **Step 3: Confirm the Wallet table is no longer written**

```bash
grep -rn "prisma\.wallet\." /Users/dandelionlabs/development/personal/obelisk/src 2>&1 | grep -v test | grep -v generated | head -5
```

Expected: only `legacy-export` remains as a reader.

- [ ] **Step 4: Commit any final tweaks**

```bash
cd <worktree> && git status --short
# fix anything outstanding, then commit
```

---

## Done

After E3, the feature is shippable:
- Quick Setup creates a Lightning wallet in one click via `https://zaps.nostr-wot.com`
- Lightning Address claim/release working
- Three connect tabs (Quick Setup / NWC / LNbits)
- All wallet credentials live only in users' browsers, encrypted with the DM cache key
- Server has no `NWC_ENCRYPTION_KEY`, can't decrypt anything, can't call NWC
- Existing users auto-migrate on next chat-page mount
- "Powered by nostr-wot" attribution on every wallet surface
- Public invoice payments use server claim → client pay → server confirm
- Zaps use LNURL-pay against the recipient's address; server only logs the receipt
