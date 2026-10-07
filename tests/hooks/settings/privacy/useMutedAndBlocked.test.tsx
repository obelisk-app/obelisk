import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useModerationStore } from '@/store/moderation';
import { useMutedAndBlocked } from '@/hooks/settings/privacy/useMutedAndBlocked';

beforeEach(() => {
  useModerationStore.setState({ mutedPubkeys: [], blockedPubkeys: [] });
});

describe('useMutedAndBlocked', () => {
  it('follows the moderation store', () => {
    const { result } = renderHook(() => useMutedAndBlocked());
    expect(result.current).toEqual([]);
    act(() => useModerationStore.setState({ mutedPubkeys: ['a'], blockedPubkeys: ['b'] }));
    expect(result.current).toEqual([{ pubkey: 'a', kind: 'mute' }, { pubkey: 'b', kind: 'block' }]);
  });
});
