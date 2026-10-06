/**
 * Reading a `nostr+walletconnect://` URI (NIP-47): the wallet service's
 * pubkey, the relays it listens on, the client secret it handed out, and an
 * optional Lightning address.
 *
 *   nostr+walletconnect://<wallet pubkey hex>?relay=wss://...&secret=<hex>[&relay=...][&lud16=...]
 *
 * Strict on purpose: the URI is a spending credential, so anything that is
 * not plainly one (a bad key, a relay that is not wss://, no secret) is
 * refused before a socket is opened. `ws://` is accepted only for a local
 * relay (localhost, 127.0.0.1), the way wallet developers run one.
 *
 * No app imports: a mini-package.
 */
import { normalizeURL } from 'nostr-tools/utils';
import { getPublicKey } from 'nostr-tools/pure';
import { NwcError } from './errors';

export interface NwcConnection {
  /** The wallet service's pubkey, hex. Requests are encrypted to it and its answers are signed by it. */
  readonly walletPubkey: string;
  /** Normalized relay URLs, at most `MAX_NWC_RELAYS`, in the order the URI lists them. */
  readonly relays: readonly string[];
  /** The client key the wallet authorised. Signs requests; never the user's key. */
  readonly secret: Uint8Array;
  /** The client key's pubkey, hex. */
  readonly clientPubkey: string;
  readonly lud16: string | null;
}

export const MAX_NWC_RELAYS = 3;

const URI_RE = /^nostr\+?walletconnect:(?:\/\/)?([0-9a-f]{64})\/?\?(.*)$/i;
const HEX64 = /^[0-9a-f]{64}$/i;
const LUD16_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

function relayUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const ok = url.protocol === 'wss:' || (url.protocol === 'ws:' && isLocalHost(url.hostname));
  if (!ok) return null;
  try {
    return normalizeURL(url.toString());
  } catch {
    return null;
  }
}

/** Parse and check a connection URI. Throws `NwcError('nwc-invalid-uri')` for anything else. */
export function parseNwcUri(input: string): NwcConnection {
  const invalid = () => new NwcError('nwc-invalid-uri', 'not-paid');
  const match = URI_RE.exec(input.trim());
  if (!match) throw invalid();
  const walletPubkey = match[1].toLowerCase();
  const params = new URLSearchParams(match[2]);
  const secretHex = params.get('secret') ?? '';
  if (!HEX64.test(secretHex)) throw invalid();
  const relays: string[] = [];
  for (const raw of params.getAll('relay')) {
    const url = relayUrl(raw);
    if (!url) throw invalid();
    if (!relays.includes(url)) relays.push(url);
  }
  if (relays.length === 0) throw invalid();
  const secret = hexToBytes(secretHex.toLowerCase());
  let clientPubkey: string;
  try {
    clientPubkey = getPublicKey(secret);
  } catch {
    throw invalid();
  }
  const lud16 = params.get('lud16')?.trim() ?? '';
  return {
    walletPubkey,
    relays: relays.slice(0, MAX_NWC_RELAYS),
    secret,
    clientPubkey,
    lud16: LUD16_RE.test(lud16) ? lud16 : null,
  };
}
