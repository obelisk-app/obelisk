/**
 * NIP-17 kind-15 file message: the tag layout and its parser.
 *
 * A kind-15 rumor's `content` is the URL of the *encrypted* blob; everything a
 * reader needs to fetch, verify and decrypt it rides in tags:
 *
 *   ["file-type", "<plaintext mime>"]
 *   ["encryption-algorithm", "aes-gcm"]
 *   ["decryption-key", "<hex>"]
 *   ["decryption-nonce", "<hex>"]
 *   ["x", "<sha256 of the ciphertext>"]
 *   ["ox", "<sha256 of the plaintext>"]      optional
 *   ["size", "<plaintext bytes>"]            optional
 *   ["dim", "<w>x<h>"]                      optional
 *   ["name", "<original filename>"]         Obelisk extra, optional
 *   ["duration", "<seconds>"]               Obelisk extra: marks an audio
 *                                           file as a voice note
 *
 * The rumor is only ever seen inside a gift wrap, so none of this is on the
 * wire in the clear.
 */

import { isHttpUrl } from '@/utils/url/http-url';
import { FILE_CIPHER_ALGORITHM } from '@nostr-wot/dm';

export interface JsDmFile {
  readonly url: string;
  /** Plaintext mime type, e.g. `image/jpeg`. */
  readonly mimeType: string;
  readonly algorithm: string;
  readonly key: string;
  readonly nonce: string;
  /** SHA-256 of the ciphertext. */
  readonly x: string;
  readonly ox?: string;
  readonly size?: number;
  readonly dim?: { readonly width: number; readonly height: number };
  readonly name?: string;
  /** Voice-note length; present only on recorded voice notes. */
  readonly durationSeconds?: number;
}

const HEX = /^[0-9a-f]+$/i;

export function buildDmFileTags(file: Omit<JsDmFile, 'url'>): string[][] {
  const tags: string[][] = [
    ['file-type', file.mimeType],
    ['encryption-algorithm', file.algorithm],
    ['decryption-key', file.key],
    ['decryption-nonce', file.nonce],
    ['x', file.x],
  ];
  if (file.ox) tags.push(['ox', file.ox]);
  if (typeof file.size === 'number') tags.push(['size', String(file.size)]);
  if (file.dim) tags.push(['dim', `${file.dim.width}x${file.dim.height}`]);
  if (file.name) tags.push(['name', file.name]);
  if (typeof file.durationSeconds === 'number') {
    tags.push(['duration', String(Math.max(0, Math.min(3600, Math.round(file.durationSeconds))))]);
  }
  return tags;
}

/**
 * Parse a kind-15 rumor. Returns null for anything we could not decrypt:
 * a non-https URL, an algorithm other than AES-GCM, or a missing key/nonce.
 * The URL is later handed to `fetch`, so it must be http(s).
 */
export function parseDmFileRumor(content: string, tags: ReadonlyArray<ReadonlyArray<string>>): JsDmFile | null {
  const tag = (name: string) => tags.find((t) => t[0] === name)?.[1];
  const url = content.trim();
  if (!isHttpUrl(url)) return null;
  const algorithm = (tag('encryption-algorithm') ?? '').toLowerCase();
  if (algorithm !== FILE_CIPHER_ALGORITHM) return null;
  const key = tag('decryption-key') ?? '';
  const nonce = tag('decryption-nonce') ?? '';
  const x = tag('x') ?? '';
  if (!HEX.test(key) || !HEX.test(nonce)) return null;
  const sizeRaw = Number(tag('size'));
  const dimMatch = /^(\d+)x(\d+)$/.exec(tag('dim') ?? '');
  const name = tag('name')?.slice(0, 200);
  const durationRaw = Number(tag('duration'));
  const durationSeconds = tag('duration') !== undefined && Number.isFinite(durationRaw) && durationRaw >= 0 && durationRaw <= 3600
    ? Math.round(durationRaw)
    : undefined;
  return {
    url,
    mimeType: tag('file-type') || 'application/octet-stream',
    algorithm,
    key: key.toLowerCase(),
    nonce: nonce.toLowerCase(),
    x: HEX.test(x) ? x.toLowerCase() : '',
    ox: tag('ox'),
    size: Number.isFinite(sizeRaw) && sizeRaw > 0 ? sizeRaw : undefined,
    dim: dimMatch ? { width: Number(dimMatch[1]), height: Number(dimMatch[2]) } : undefined,
    name: name || undefined,
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
  };
}

export type DmFileCategory = 'image' | 'video' | 'audio' | 'file';

export function dmFileCategory(mimeType: string): DmFileCategory {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}
