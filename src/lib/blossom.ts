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
export async function uploadEncryptedBlob(ciphertext: Uint8Array): Promise<string> {
  const hash = bytesToHex(sha256(ciphertext));
  const throwaway = generateSecretKey();
  let lastError: Error | null = null;

  for (const server of BLOSSOM_SERVERS) {
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
        throw new Error(`${server}: ${res.status} ${text}`);
      }
      const data = await res.json();
      if (typeof data?.url !== 'string') throw new Error(`${server}: no url in response`);
      return data.url;
    } catch (err) {
      lastError = err as Error;
      console.warn(`Encrypted Blossom upload failed on ${server}:`, err);
    }
  }

  throw lastError || new Error('All Blossom servers failed');
}
