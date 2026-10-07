'use client';

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { finalizeEvent, generateSecretKey } from 'nostr-tools/pure';
import { KIND_BLOSSOM_AUTH } from '@/constants/nostr/nip-kinds';
import { nostrActions } from '@/services/nostr-bridge';
import { ENCRYPTED_BLOSSOM_SERVERS } from '@/constants/media/blossom';

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

/**
 * Every server refused an upload. `reasons` (one per server, `host: why`) and
 * the message are for logs; the UI shows its own "upload failed" copy.
 */
export class BlossomUploadError extends Error {
  readonly reasons: readonly string[];

  constructor(reasons: readonly string[]) {
    super(`blossom upload failed: ${reasons.length > 0 ? reasons.join('; ') : 'no server to try'}`);
    this.name = 'BlossomUploadError';
    this.reasons = reasons;
  }
}

export async function uploadToBlossom(file: File, secretKey?: Uint8Array): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const hash = bytesToHex(sha256(buffer));
  const authToken = await createAuthEvent(hash, secretKey);

  const reasons: string[] = [];

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
        throw new Error(`${res.status} ${text}`);
      }

      const data = await res.json();
      return data.url as string;
    } catch (err) {
      reasons.push(`${server}: ${(err as Error).message}`);
      console.warn('[blossom] upload failed on', server, err);
    }
  }

  throw new BlossomUploadError(reasons);
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
      console.warn('Encrypted Blossom upload failed:', reason);
    }
  }

  throw new BlossomUploadError(reasons);
}
