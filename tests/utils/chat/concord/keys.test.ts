import { createHash, hkdfSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { concordCommunityId, concordEpochCommitment, concordGroupKey, concordKeyMaterial } from '@/utils/chat/concord/keys';

describe('CORD-02 derivations against independent Node crypto', () => {
  const secret = new Uint8Array(32).fill(1);
  const id = new Uint8Array(32).fill(2);

  it('uses a raw id and big-endian u64 epoch without precision loss', () => {
    const epoch = BigInt('9007199254740993');
    const suffix = Buffer.alloc(8);
    suffix.writeBigUInt64BE(epoch);
    const info = Buffer.concat([Buffer.from('concord/channel\0'), id, suffix]);
    const expected = new Uint8Array(hkdfSync('sha256', secret, Buffer.alloc(0), info, 32));
    expect(concordKeyMaterial(secret, 'concord/channel', id, epoch)).toEqual(expected);
    expect(concordKeyMaterial(secret, 'concord/channel', id)).not.toEqual(
      concordKeyMaterial(secret, 'concord/channel', id, BigInt('0')),
    );
  });

  it('commits to the owner and salt with no separator', () => {
    const expected = createHash('sha256').update('concord/community').update(id).update(secret).digest('hex');
    expect(concordCommunityId(id, secret)).toBe(expected);
    expect(concordCommunityId(secret, id)).not.toBe(expected);
  });

  it('separates epochs and plane identities', () => {
    const keys = ['concord/control', 'concord/control-signer', 'concord/channel']
      .map(label => concordGroupKey(secret, label, id, BigInt('0')));
    expect(new Set(keys.map(key => key.pk)).size).toBe(3);
    expect(keys[0].conversationKey).toHaveLength(32);
    expect(concordGroupKey(secret, 'concord/control', id, BigInt('1')).pk).not.toBe(keys[0].pk);
  });

  it('rejects truncated ids and out-of-range epochs', () => {
    expect(() => concordCommunityId(id.subarray(1), secret)).toThrow();
    expect(() => concordEpochCommitment(secret, -BigInt('1'))).toThrow();
    expect(() => concordKeyMaterial(secret, 'concord/channel', id, BigInt('1') << BigInt('64'))).toThrow();
  });
});
