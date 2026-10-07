import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import type { StarterPack } from '@/services/social/starter-packs';
import { useToastStore } from '@/store/feedback/toast';
import { followStarterPack } from '@/services/social/follow-starter-pack';

const pk = (n: number) => String(n).repeat(64).slice(0, 64);
const PACK: StarterPack = {
  id: '39089:c:devs', title: 'Devs', description: '', image: null, curator: pk(9), members: [pk(1), pk(2)], createdAt: 1,
};
const t = ((key: string) => key) as never;

beforeEach(() => useToastStore.getState().clearToasts());

describe('followStarterPack', () => {
  it('publishes one merged, replaceable contact list to the social relays', async () => {
    const publishEvent = vi.fn().mockResolvedValue(undefined);
    const contactEvent = { id: 'c', pubkey: pk(5), kind: 3, created_at: 10, sig: '', content: '{"x":1}', tags: [['p', pk(7)]] } as NostrEvent;
    await followStarterPack({ bridge: { publishEvent }, contactEvent, pack: PACK, relays: ['wss://r'], t, now: 50_000 });
    expect(publishEvent).toHaveBeenCalledTimes(1);
    const [event, opts] = publishEvent.mock.calls[0];
    expect(event.kind).toBe(3);
    expect(event.content).toBe('{"x":1}');
    expect(event.tags).toEqual([['p', pk(7)], ['p', pk(1)], ['p', pk(2)]]);
    expect(event.created_at).toBe(50);
    expect(opts).toEqual({ extraRelays: ['wss://r'], mode: 'replace' });
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ title: 'social.packFollowed', body: 'Devs' });
  });

  it('dates the list after the one it replaces when the clock is behind', async () => {
    const publishEvent = vi.fn().mockResolvedValue(undefined);
    const contactEvent = { id: 'c', pubkey: pk(5), kind: 3, created_at: 900, sig: '', content: '', tags: [] } as NostrEvent;
    await followStarterPack({ bridge: { publishEvent }, contactEvent, pack: PACK, relays: [], t, now: 1_000 });
    expect(publishEvent.mock.calls[0][0].created_at).toBe(901);
  });

  it('starts a list from nothing', async () => {
    const publishEvent = vi.fn().mockResolvedValue(undefined);
    await followStarterPack({ bridge: { publishEvent }, contactEvent: null, pack: PACK, relays: [], t, now: 2_000 });
    expect(publishEvent.mock.calls[0][0]).toMatchObject({ content: '', created_at: 2 });
  });

  it('reports a failed write instead of throwing', async () => {
    const publishEvent = vi.fn().mockRejectedValue(new Error('no'));
    await expect(followStarterPack({ bridge: { publishEvent }, contactEvent: null, pack: PACK, relays: [], t })).resolves.toBeUndefined();
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ title: 'social.actionFailed', body: 'Devs' });
  });
});
