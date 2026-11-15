import { describe, expect, it } from 'vitest';
import { bytesToHex } from '@noble/hashes/utils.js';
import { communityId, epochKeyCommitment, groupKey, decodeWrap } from '@applesauce/concord/helpers';
import { giftWrap } from '@applesauce/concord/operations';
import { PrivateKeySigner } from 'applesauce-signers';
import { generateSecretKey } from 'nostr-tools';
import { concordCommunityId, concordEpochCommitment, concordGroupKey } from '@/utils/chat/concord/keys';
import { KIND_GROUP_CHAT_MESSAGE } from '@/constants/nostr/nip-kinds';

describe('pinned Concord SDK interoperability', () => {
  const root = new Uint8Array(32).fill(17);
  const channel = new Uint8Array(32).fill(23);

  it('derives byte-identical stream addresses and commitments', () => {
    for (const epoch of [BigInt('0'), BigInt('1'), BigInt('9007199254740993')]) {
      const ours = concordGroupKey(root, 'concord/channel', channel, epoch);
      const reference = groupKey('concord/channel', root, channel, epoch);
      expect(ours.sk).toEqual(reference.sk);
      expect(ours.pk).toEqual(reference.pk);
      expect(ours.conversationKey).toEqual(reference.convKey);
      expect(concordEpochCommitment(root, epoch)).toBe(bytesToHex(epochKeyCommitment(epoch, root)));
    }
    expect(concordCommunityId(channel, root)).toBe(bytesToHex(communityId(bytesToHex(channel), root)));
  });

  it('opens two independent authors with the same channel key but not the next epoch key', async () => {
    const key = concordGroupKey(root, 'concord/channel', channel, BigInt('0'));
    const next = concordGroupKey(root, 'concord/channel', channel, BigInt('1'));
    const authors = [new PrivateKeySigner(generateSecretKey()), new PrivateKeySigner(generateSecretKey())];
    const decodedAuthors = new Set<string>();
    for (const author of authors) {
      const wrap = await giftWrap(key.sk, key.conversationKey, author)({
        kind: KIND_GROUP_CHAT_MESSAGE, created_at: 1700000000,
        tags: [['channel', bytesToHex(channel)], ['epoch', '0']], content: 'private test message',
      });
      expect(wrap.content).not.toContain('private test message');
      expect(wrap.pubkey).toBe(key.pk);
      const decoded = decodeWrap(wrap, key.conversationKey);
      expect(decoded).not.toBeNull();
      expect(decodeWrap(wrap, next.conversationKey)).toBeNull();
      decodedAuthors.add(await author.getPublicKey());
    }
    expect(decodedAuthors.size).toBe(2);
  });
});
