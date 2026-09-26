'use client';

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { finalizeEvent, generateSecretKey } from 'nostr-tools/pure';
import { KIND_BLOSSOM_AUTH } from '@/lib/nip-kinds';
import { nostrActions } from '@/lib/nostr-bridge';

const BLOSSOM_SERVERS = [
  'https://blossom.primal.net',
  'https://nostr.build',
  'https://blossom.band',
];

/**
 * Servers for encrypted DM attachments — a separate list on purpose.
 *
 * Every server above sniffs the upload and only stores recognisable media:
 * measured 2026-09-26, primal and blossom.band answer 415 to
 * `application/octet-stream` (and 400 "does not match the file content" if
 * the ciphertext is labelled as an image), and nostr.build returns an HTML
 * page. AES-GCM ciphertext is indistinguishable from random bytes, so it can
 * never pass that check. These two store arbitrary blobs from a key they have
 * never seen, serve them back byte-for-byte with `Access-Control-Allow-Origin:
 * *`, and were verified with 4 KB and 3 MB round trips the same day.
 */
export const ENCRYPTED_BLOSSOM_SERVERS = [
  'https://nostr.download',
  'https://blossom.yakihonne.com',
];

async function createAuthEvent(fileHash: string, secretKey?: Uint8Array, server?: string): Promise<string> {
  const tags = [
    ['t', 'upload'],
    ['x', fileHash],
    ['expiration', String(Math.floor(Date.now() / 1000) + 3600)],
  ];
  if (server) tags.push(['server', new URL(server).host]);
  const template = {
    kind: KIND_BLOSSOM_AUTH,
    content: '',
    tags,
    created_at: Math.floor(Date.now() / 1000),
  };
  const event = secretKey
    ? finalizeEvent(template, secretKey)
    : await nostrActions.signEventTemplate(template);
  return btoa(JSON.stringify(event));
}

export async function uploadToBlossom(file: File, secretKey?: Uint8Array): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const hash = bytesToHex(sha256(buffer));
  const authToken = await createAuthEvent(hash, secretKey);

  let lastError: Error | null = null;

  for (const server of BLOSSOM_SERVERS) {
    try {
      const res = await fetch(`${server}/upload`, {
        method: 'PUT',
        headers: {
          'Authorization': `Nostr ${authToken}`,
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: buffer,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`${server}: ${res.status} ${text}`);
      }

      const data = await res.json();
      return data.url as string;
    } catch (err) {
      lastError = err as Error;
      console.warn(`Blossom upload failed on ${server}:`, err);
    }
  }

  throw lastError || new Error('All Blossom servers failed');
}

/**
 * Upload an already-encrypted blob (a NIP-17 kind-15 attachment) without
 * telling the Blossom server who we are.
 *
 * `uploadToBlossom` signs its BUD-01 auth with the user's real key, so every
 * upload tells the server "this npub stored this hash". For a DM attachment
 * that pairs our identity with a blob whose URL we are about to hand to one
 * specific person, so this path signs with a throwaway key minted per upload
 * instead. The server then learns the ciphertext's size and hash and nothing
 * else. Each attempt carries a `server` tag so a token lifted from one server
 * cannot be replayed on the next one in the list.
 *
 * The blob is sent as `application/octet-stream`: the real mime type lives
 * only inside the gift-wrapped rumor.
 */
export async function uploadEncryptedBlob(
  ciphertext: Uint8Array,
  servers: readonly string[] = ENCRYPTED_BLOSSOM_SERVERS,
): Promise<string> {
  const hash = bytesToHex(sha256(ciphertext));
  const throwaway = generateSecretKey();
  const reasons: string[] = [];

  for (const server of servers) {
    try {
      const authToken = await createAuthEvent(hash, throwaway, server);
      const res = await fetch(`${server}/upload`, {
        method: 'PUT',
        headers: {
          'Authorization': `Nostr ${authToken}`,
          'Content-Type': 'application/octet-stream',
        },
        body: ciphertext as Uint8Array<ArrayBuffer>,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`${res.status} ${text.slice(0, 120)}`);
      }
      let data: { url?: unknown };
      try {
        data = await res.json();
      } catch {
        // nostr.build, for one, answers an upload it won't take with a 200
        // HTML page.
        throw new Error('not a Blossom JSON response');
      }
      const url = typeof data?.url === 'string' ? data.url : '';
      // A Blossom URL names the blob by its hash. One that doesn't is not the
      // blob we sent, and the reader's integrity check would reject it anyway.
      if (!/^https:\/\//.test(url) || !url.includes(hash)) throw new Error('response URL does not name the uploaded blob');
      return url;
    } catch (err) {
      const reason = `${new URL(server).host}: ${(err as Error).message}`;
      reasons.push(reason);
      console.warn('Encrypted Blossom upload failed —', reason);
    }
  }

  throw new Error(`Upload failed (${reasons.join('; ') || 'no servers'})`);
}
