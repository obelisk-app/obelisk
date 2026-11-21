import { CONCORD_BACKUP_MAX_BYTES } from '@/constants/nostr-bridge/concord';
import { exact, fromBase64Url, subtle, toBase64Url } from '@/lib/crypto/webcrypto';
import type { NipSigner } from '@/types/nostr/nip-signer';

const format = 'obelisk-concord-backup';
type BackupRecords = Array<[string, string]>;
type BackupSigner = Pick<NipSigner, 'pubkey' | 'nip44Encrypt' | 'nip44Decrypt'>;

function isConcordBackupRecords(value: unknown): value is BackupRecords {
  if (!Array.isArray(value) || !value.length) return false;
  const seen = new Set<string>();
  return value.every((row: unknown) => {
    if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== 'string' ||
      !/^[a-f0-9]{64}$/.test(row[0]) || typeof row[1] !== 'string' || seen.has(row[0])) return false;
    seen.add(row[0]);
    return true;
  });
}

function backupAad(pubkey: string) {
  return exact(new TextEncoder().encode(`${format}:1:${pubkey}`));
}

export async function sealConcordBackup(signer: BackupSigner, records: BackupRecords) {
  if (!records.length) throw new Error('No Concord data to back up');
  const plain = exact(new TextEncoder().encode(JSON.stringify(records)));
  if (plain.byteLength > (CONCORD_BACKUP_MAX_BYTES - 1024) * 3 / 4) throw new Error('Concord backup is too large');
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const key = await subtle().importKey('raw', secret, 'AES-GCM', false, ['encrypt']);
    const ciphertext = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: backupAad(signer.pubkey) }, key, plain);
    const wrappedKey = await signer.nip44Encrypt(signer.pubkey, toBase64Url(secret));
    return JSON.stringify({ format, version: 1, pubkey: signer.pubkey, wrappedKey, iv: toBase64Url(iv), ciphertext: toBase64Url(new Uint8Array(ciphertext)) });
  } finally {
    secret.fill(0);
    plain.fill(0);
  }
}

export async function openConcordBackup(signer: BackupSigner, file: File): Promise<BackupRecords> {
  if (file.size > CONCORD_BACKUP_MAX_BYTES) throw new Error('Concord backup is too large');
  const envelope: unknown = JSON.parse(await file.text());
  if (!envelope || typeof envelope !== 'object' || !('format' in envelope) || envelope.format !== format ||
    !('version' in envelope) || envelope.version !== 1 || !('pubkey' in envelope) || envelope.pubkey !== signer.pubkey ||
    !('wrappedKey' in envelope) || typeof envelope.wrappedKey !== 'string' ||
    !('iv' in envelope) || typeof envelope.iv !== 'string' ||
    !('ciphertext' in envelope) || typeof envelope.ciphertext !== 'string') throw new Error('Invalid Concord backup');
  const iv = fromBase64Url(envelope.iv);
  if (iv.length !== 12) throw new Error('Invalid Concord backup nonce');
  const secret = fromBase64Url(await signer.nip44Decrypt(signer.pubkey, envelope.wrappedKey));
  try {
    if (secret.length !== 32) throw new Error('Invalid Concord backup key');
    const key = await subtle().importKey('raw', secret, 'AES-GCM', false, ['decrypt']);
    const plain = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: backupAad(signer.pubkey) }, key, fromBase64Url(envelope.ciphertext)));
    try {
      const records: unknown = JSON.parse(new TextDecoder().decode(plain));
      if (!isConcordBackupRecords(records)) throw new Error('Invalid Concord backup records');
      return records;
    } finally { plain.fill(0); }
  } finally { secret.fill(0); }
}
