import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.NWC_ENCRYPTION_KEY;
  if (!raw) throw new Error('NWC_ENCRYPTION_KEY is not set');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('NWC_ENCRYPTION_KEY must be 32 bytes (base64)');
  return buf;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString('base64');
}

export function decrypt(packed: string): string {
  const key = getKey();
  const buf = Buffer.from(packed, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(buf.length - AUTH_TAG_LENGTH);
  const ct = buf.subarray(IV_LENGTH, buf.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
