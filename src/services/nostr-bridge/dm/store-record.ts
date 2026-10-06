/**
 * What one stored DM holds, and how it is turned into bytes and back.
 *
 * A record is the thread ingest's own input (`IngestDmParams`): enough to
 * rebuild the thread entry, the bell card's preview and "View raw event"
 * without asking the signer. The bytes only ever exist inside an
 * AES-256-GCM box (`store.ts`), bound to the account and the wire id by the
 * additional data below, so a box moved to another slot or another account
 * does not open.
 *
 * Parsing checks types rather than trusting the decrypt: a box that opens
 * was written by this app under this key, but a record from a future build
 * may carry a shape this one cannot render, and that is dropped like a
 * tampered one (the message comes back from the relays).
 */
import type { JsDmFile } from '@/utils/attachments/dm-file';
import type { DmRawEvent } from './types';
import type { IngestDmParams } from './thread';

const RECORD_VERSION = 1;

/** The additional data a record's box is bound to. */
export function recordAad(pubkey: string, wireId: string): string {
  return `obelisk-dm:v1:${pubkey}:${wireId}`;
}

export function encodeRecord(params: IngestDmParams): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ v: RECORD_VERSION, dm: params }));
}

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTags(value: unknown): value is string[][] {
  return Array.isArray(value) && value.every((t) => Array.isArray(t) && t.every((s) => typeof s === 'string'));
}

function rawEvent(value: unknown): DmRawEvent | undefined {
  if (!isRecord(value)) return undefined;
  const { id, pubkey, created_at, kind, tags, content, sig } = value;
  if (typeof id !== 'string' || typeof pubkey !== 'string' || typeof content !== 'string') return undefined;
  if (typeof created_at !== 'number' || typeof kind !== 'number' || !isTags(tags)) return undefined;
  return { id, pubkey, created_at, kind, tags, content, ...(typeof sig === 'string' ? { sig } : {}) };
}

function fileOf(value: unknown): JsDmFile | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const { url, mimeType, algorithm, key, nonce, x } = value;
  if ([url, mimeType, algorithm, key, nonce, x].some((v) => typeof v !== 'string')) return null;
  return value as unknown as JsDmFile;
}

/** The record inside decrypted bytes, or `null` when it is not one this build can rebuild. */
export function decodeRecord(bytes: Uint8Array): IngestDmParams | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.v !== RECORD_VERSION || !isRecord(parsed.dm)) return null;
  const dm = parsed.dm;
  const { id, createdAt, plaintext, outgoing, counterparty, protocol, pq, notifyId } = dm;
  if (typeof id !== 'string' || typeof plaintext !== 'string' || typeof counterparty !== 'string') return null;
  if (typeof notifyId !== 'string' || typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null;
  if (typeof outgoing !== 'boolean' || typeof pq !== 'boolean') return null;
  if (protocol !== 'nip04' && protocol !== 'nip17') return null;
  const file = fileOf(dm.file);
  if (file === null) return null;
  const tags = isTags(dm.tags) ? dm.tags : undefined;
  const raw = isRecord(dm.raw) ? { rumor: rawEvent(dm.raw.rumor), wire: rawEvent(dm.raw.wire) } : undefined;
  return {
    id, createdAt, plaintext, outgoing, counterparty, protocol, pq, notifyId,
    ...(file ? { file } : {}),
    ...(tags ? { tags } : {}),
    ...(raw && (raw.rumor || raw.wire) ? { raw: { ...(raw.rumor ? { rumor: raw.rumor } : {}), ...(raw.wire ? { wire: raw.wire } : {}) } } : {}),
  };
}
