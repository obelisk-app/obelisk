import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, bytesToHex } from '@noble/hashes/utils.js';
import { getPublicKey, nip44 } from 'nostr-tools';

function bytes32(value: Uint8Array): void {
  if (value.length !== 32) throw new RangeError('Expected 32 bytes');
}

function epochBytes(epoch: bigint): Uint8Array {
  if (epoch < BigInt('0') || epoch > BigInt('0xffffffffffffffff')) throw new RangeError('Invalid epoch');
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, epoch, false);
  return bytes;
}

/** CORD-02 Appendix A: the absent epoch is distinct from epoch zero. */
export function concordKeyMaterial(
  secret: Uint8Array, label: string, id: Uint8Array, epoch?: bigint, retry?: number,
): Uint8Array {
  bytes32(id);
  if (!label.startsWith('concord/') || label.includes('\0')) throw new Error('Invalid derivation label');
  if (retry !== undefined && (!Number.isInteger(retry) || retry < 0 || retry > 255)) {
    throw new RangeError('Invalid scalar retry');
  }
  const info = concatBytes(
    new TextEncoder().encode(label), new Uint8Array([0]), id,
    epoch === undefined ? new Uint8Array() : epochBytes(epoch),
    retry === undefined ? new Uint8Array() : new Uint8Array([retry]),
  );
  return hkdf(sha256, secret, new Uint8Array(), info, 32);
}

/** Deterministic secp256k1 normalization, followed by NIP-44 self-ECDH. */
export function concordGroupKey(secret: Uint8Array, label: string, id: Uint8Array, epoch?: bigint) {
  bytes32(secret);
  for (let attempt = -1; attempt < 256; attempt++) {
    const sk = concordKeyMaterial(secret, label, id, epoch, attempt < 0 ? undefined : attempt);
    let pk: string;
    try { pk = getPublicKey(sk); } catch { continue; }
    return { sk, pk, conversationKey: nip44.v2.utils.getConversationKey(sk, pk) };
  }
  throw new Error('Scalar derivation exhausted');
}

export function concordCommunityId(owner: Uint8Array, salt: Uint8Array): string {
  bytes32(owner);
  bytes32(salt);
  return bytesToHex(sha256(concatBytes(new TextEncoder().encode('concord/community'), owner, salt)));
}

export function concordEpochCommitment(key: Uint8Array, epoch: bigint): string {
  bytes32(key);
  return bytesToHex(sha256(concatBytes(
    new TextEncoder().encode('concord/epoch-key-commitment'), epochBytes(epoch), key,
  )));
}
