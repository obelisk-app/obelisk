import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { JsUserMetadata } from '@/services/nostr-bridge';
import { StateStore } from '@/services/nostr-bridge/state-store';
import { groupFixture, userMetadataFixture } from '@tests/support/mocks/nostr-bridge';

const ALICE = 'a'.repeat(64);
const BOB = 'c'.repeat(64);
const META = {
  [ALICE]: userMetadataFixture({ pubkey: ALICE, displayName: 'Alice', name: 'alice' }),
  [BOB]: userMetadataFixture({ pubkey: BOB, displayName: 'Bob', name: 'bob' }),
};
const impl = { userMetadata: new StateStore<Record<string, JsUserMetadata>>(META) };

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    getBridge: () => Promise.resolve(impl),
    getBridgeImpl: () => impl,
    useGroups: () => [groupFixture({ id: 'g' })],
    useMembersByGroup: () => ({ g: [ALICE] }),
    useAdminsByGroup: () => ({ g: [BOB] }),
    useGroupCreators: () => ({}),
  });
});

import { useComposerMetadata, useMentionCandidates } from '@/hooks/chat/composer/useComposerPeople';

describe('useComposerPeople', () => {
  it('useComposerMetadata follows the bridge store', async () => {
    const { result } = renderHook(() => useComposerMetadata());
    await waitFor(() => expect(result.current[ALICE]?.displayName).toBe('Alice'));
  });

  it('mention candidates span members and admins, filtered and capped, and are empty while closed', () => {
    const closed = renderHook(() => useMentionCandidates(null, META, 8));
    expect(closed.result.current).toEqual([]);
    const all = renderHook(() => useMentionCandidates('', META, 8));
    expect(all.result.current.map((m) => m.displayName).sort()).toEqual(['Alice', 'Bob']);
    const one = renderHook(() => useMentionCandidates('bo', META, 8));
    expect(one.result.current.map((m) => m.pubkey)).toEqual([BOB]);
    const capped = renderHook(() => useMentionCandidates('', META, 1));
    expect(capped.result.current).toHaveLength(1);
  });
});
