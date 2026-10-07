import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

const mocks = vi.hoisted(() => ({
  fetchStarterPacks: vi.fn(),
  ensureSocialProfiles: vi.fn(),
  followStarterPack: vi.fn(),
}));

vi.mock('@/services/social/starter-packs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/social/starter-packs')>()),
  fetchStarterPacks: mocks.fetchStarterPacks,
}));
vi.mock('@/services/social/profiles', () => ({ ensureSocialProfiles: mocks.ensureSocialProfiles }));
vi.mock('@/services/social/follow-starter-pack', () => ({ followStarterPack: mocks.followStarterPack }));

import { useStarterPacks } from '@/hooks/social/feed/useStarterPacks';

const pk = (n: number) => String(n).repeat(64).slice(0, 64);
const PACK = { id: 'a', title: 'A', description: '', image: null, curator: pk(9), members: [pk(1), pk(2)], createdAt: 1 };

beforeEach(() => {
  mocks.fetchStarterPacks.mockReset().mockResolvedValue([PACK]);
  mocks.ensureSocialProfiles.mockReset();
  mocks.followStarterPack.mockReset().mockResolvedValue(undefined);
});

describe('useStarterPacks', () => {
  it('is null while loading, then one row per pack, and fetches the faces', async () => {
    const { result } = renderHook(() => useStarterPacks(), { wrapper: bridgeWrapper(fakeBridge()) });
    expect(result.current.rows).toBeNull();
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows![0]).toMatchObject({ remaining: 2, already: 0 });
    expect(mocks.ensureSocialProfiles).toHaveBeenCalledWith([pk(1), pk(2)]);
  });

  it('is empty when the relays fail', async () => {
    mocks.fetchStarterPacks.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useStarterPacks(), { wrapper: bridgeWrapper(fakeBridge()) });
    await waitFor(() => expect(result.current.rows).toEqual([]));
  });

  it('marks the pack busy while it is followed', async () => {
    let finish: () => void = () => {};
    mocks.followStarterPack.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useStarterPacks(), { wrapper: bridgeWrapper(fakeBridge()) });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    act(() => result.current.follow(PACK));
    expect(result.current.busy).toBe('a');
    expect(mocks.followStarterPack).toHaveBeenCalledWith(expect.objectContaining({ pack: PACK }));
    await act(async () => { finish(); });
    expect(result.current.busy).toBeNull();
  });
});
