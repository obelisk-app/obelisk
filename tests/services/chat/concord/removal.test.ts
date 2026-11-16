import { describe, expect, it, vi } from 'vitest';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { banConcordMember } from '@/services/chat/concord/removal';

vi.mock('@applesauce/concord/helpers', () => ({ refoundAuthority: () => () => true }));

function fixture() {
  const community = {
    pubkey: 'owner', canDo: () => true,
    state$: { value: { channels: [{ channel_id: 'a', private: true }, { channel_id: 'b', private: true }], members: new Set(['owner', 'target', 'reader']), banlist: new Set() } },
    material: { channels: [{ id: 'a' }, { id: 'b' }] },
    rotateChannel: vi.fn(async () => {}), banMembers: vi.fn(async () => {}),
  };
  return { community, client: community as unknown as ConcordCommunity };
}

describe('Concord removal orchestration', () => {
  it('keeps private audiences separate and requires an enforcing root rotation', async () => {
    const { community, client } = fixture();
    await banConcordMember(client, 'target', { a: ['owner', 'reader'], b: ['owner'] });
    expect(community.rotateChannel.mock.calls).toEqual([['a', { keep: ['owner', 'reader'] }], ['b', { keep: ['owner'] }]]);
    expect(community.banMembers).toHaveBeenCalledWith(['target'], { refound: true });
    expect(community.rotateChannel.mock.invocationCallOrder[1]).toBeLessThan(community.banMembers.mock.invocationCallOrder[0]);
  });

  it('rejects incomplete or unsafe readership before any mutation', async () => {
    const { community, client } = fixture();
    await expect(banConcordMember(client, 'target', { a: ['owner'] })).rejects.toThrow('reviewed');
    await expect(banConcordMember(client, 'target', { a: ['owner', 'target'], b: ['owner'] })).rejects.toThrow('reviewed');
    expect(community.rotateChannel).not.toHaveBeenCalled();
    expect(community.banMembers).not.toHaveBeenCalled();
  });

  it('does not claim a completed removal after either rotation stage fails', async () => {
    const { community, client } = fixture();
    community.rotateChannel.mockRejectedValueOnce(new Error('private rotation failed'));
    await expect(banConcordMember(client, 'target', { a: ['owner'], b: ['owner'] })).rejects.toThrow('private rotation');
    expect(community.banMembers).not.toHaveBeenCalled();
    community.banMembers.mockRejectedValueOnce(new Error('root rotation failed'));
    await expect(banConcordMember(client, 'target', { a: ['owner'], b: ['owner'] })).rejects.toThrow('root rotation');
  });
});
