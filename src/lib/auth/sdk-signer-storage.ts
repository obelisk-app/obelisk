/**
 * @nostr-wot/ui SignerStorage adapter for obelisk.
 *
 * Bridges the SDK's two-key model (`@nostr-wot/ui:nip46`,
 * `@nostr-wot/ui:nsec`) into obelisk's existing single-key encrypted
 * payload (`obelisk-signer-payload`). On write, translates the SDK
 * shape to obelisk's `{ type, ... }` shape and runs through
 * `encryptPayload`. On read, decrypts + reverse-translates.
 *
 * Effect: zero-regression migration. The SDK's auto-restore reads the
 * SAME storage obelisk's `restoreRemoteSigner()` reads, just via two
 * different adapters. New users logging in through the SDK modal land
 * in the same payload location existing users have.
 */

import {
  type SignerStorage,
  SIGNER_STORAGE_KEY_NIP46,
  SIGNER_STORAGE_KEY_NSEC,
} from '@nostr-wot/ui';
import { nip19 } from 'nostr-tools';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import {
  encryptPayload,
  decryptPayload,
} from '@/lib/signer-payload-crypto';

const SIGNER_PAYLOAD_KEY = 'obelisk-signer-payload';

interface ObeliskNsecPayload {
  type: 'nsec';
  privkey: string;
}

interface ObeliskBunkerPayload {
  type: 'bunker';
  bunkerUrl: string;
  localPrivkey: string;
}

type ObeliskPayload = ObeliskNsecPayload | ObeliskBunkerPayload;

interface SdkBunkerPaste {
  kind: 'bunker';
  uri: string;
  clientNsec: string;
}

interface SdkBunkerNostrConnect {
  kind: 'nostrconnect';
  bunkerPubkey: string;
  relays: string[];
  clientNsec: string;
}

type SdkNip46 = SdkBunkerPaste | SdkBunkerNostrConnect;

function nsecToHex(nsec: string): string {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') throw new Error('expected nsec');
  return bytesToHex(decoded.data);
}

function hexToNsec(hex: string): string {
  return nip19.nsecEncode(hexToBytes(hex));
}

function buildBunkerUriFromPair(bunkerPubkey: string, relays: string[]): string {
  const params = relays.map((r) => `relay=${encodeURIComponent(r)}`).join('&');
  return `bunker://${bunkerPubkey}?${params}`;
}

async function readObeliskPayload(): Promise<ObeliskPayload | null> {
  if (typeof localStorage === 'undefined') return null;
  let blob: string | null;
  try {
    blob = localStorage.getItem(SIGNER_PAYLOAD_KEY);
  } catch {
    return null;
  }
  if (!blob) return null;

  // Migration: detect plaintext JSON (legacy) and pass through.
  if (blob.startsWith('{')) {
    try {
      return JSON.parse(blob) as ObeliskPayload;
    } catch {
      return null;
    }
  }
  try {
    const plain = await decryptPayload(blob);
    return JSON.parse(plain) as ObeliskPayload;
  } catch {
    return null;
  }
}

async function writeObeliskPayload(p: ObeliskPayload): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  try {
    const blob = await encryptPayload(JSON.stringify(p));
    localStorage.setItem(SIGNER_PAYLOAD_KEY, blob);
  } catch (err) {
    console.warn('[obelisk-sdk-storage] write failed:', err);
  }
}

async function clearObeliskPayload(): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(SIGNER_PAYLOAD_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Pluggable SignerStorage that maps the SDK's keys onto obelisk's
 * existing encrypted-at-rest payload.
 *
 *   - `@nostr-wot/ui:nip46` ↔ `{ type: 'bunker', bunkerUrl, localPrivkey }`
 *   - `@nostr-wot/ui:nsec`  ↔ `{ type: 'nsec', privkey }`
 *
 * Writes that don't have enough info yet (e.g. the early
 * `nostrconnect` placeholder with empty `bunkerPubkey`) are silently
 * skipped — only fully-paired records make it to disk.
 */
export const obeliskSdkSignerStorage: SignerStorage = {
  async getItem(key) {
    const payload = await readObeliskPayload();
    if (!payload) return null;
    if (key === SIGNER_STORAGE_KEY_NIP46 && payload.type === 'bunker') {
      const sdk: SdkBunkerPaste = {
        kind: 'bunker',
        uri: payload.bunkerUrl,
        clientNsec: hexToNsec(payload.localPrivkey),
      };
      return JSON.stringify(sdk);
    }
    if (key === SIGNER_STORAGE_KEY_NSEC && payload.type === 'nsec') {
      return hexToNsec(payload.privkey);
    }
    return null;
  },

  async setItem(key, value) {
    if (key === SIGNER_STORAGE_KEY_NIP46) {
      let parsed: SdkNip46;
      try {
        parsed = JSON.parse(value) as SdkNip46;
      } catch {
        return;
      }
      let bunkerUrl: string;
      if (parsed.kind === 'bunker') {
        bunkerUrl = parsed.uri;
      } else if (
        parsed.kind === 'nostrconnect' &&
        parsed.bunkerPubkey &&
        parsed.relays.length > 0
      ) {
        bunkerUrl = buildBunkerUriFromPair(parsed.bunkerPubkey, parsed.relays);
      } else {
        // Pre-pair placeholder — don't persist.
        return;
      }
      let localPrivkey: string;
      try {
        localPrivkey = nsecToHex(parsed.clientNsec);
      } catch {
        return;
      }
      await writeObeliskPayload({ type: 'bunker', bunkerUrl, localPrivkey });
      return;
    }

    if (key === SIGNER_STORAGE_KEY_NSEC) {
      try {
        const privkey = nsecToHex(value);
        await writeObeliskPayload({ type: 'nsec', privkey });
      } catch {
        /* malformed; skip */
      }
      return;
    }
  },

  async removeItem(key) {
    if (
      key === SIGNER_STORAGE_KEY_NIP46 ||
      key === SIGNER_STORAGE_KEY_NSEC
    ) {
      await clearObeliskPayload();
    }
  },
};
