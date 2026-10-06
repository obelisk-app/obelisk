import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { groupFixture, userMetadataFixture } from '@tests/support/mocks/nostr-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

const ALICE = 'a'.repeat(64);
const BOB = 'c'.repeat(64);
const META = {
  [ALICE]: userMetadataFixture({ pubkey: ALICE, displayName: 'Alice', name: 'alice' }),
  [BOB]: userMetadataFixture({ pubkey: BOB, displayName: 'Bob', name: 'bob' }),
};
// One relay, one channel: Alice a member, Bob an admin. The real hooks read these.
const bridge = fakeBridge({
  userMetadata: META,
  groups: [groupFixture({ id: 'g' })],
  membersByGroup: { g: [ALICE] },
  adminsByGroup: { g: [BOB] },
});
const wrapper = bridgeWrapper(bridge);

import { useComposerMetadata, useMentionCandidates } from '@/hooks/chat/composer/useComposerPeople';

describe('useComposerPeople', () => {
  it('useComposerMetadata follows the bridge store', async () => {
    const { result } = renderHook(() => useComposerMetadata(), { wrapper });
    await waitFor(() => expect(result.current[ALICE]?.displayName).toBe('Alice'));
  });

  it('mention candidates span members and admins, filtered and capped, and are empty while closed', () => {
    const closed = renderHook(() => useMentionCandidates(null, META, 8), { wrapper });
    expect(closed.result.current).toEqual([]);
    const all = renderHook(() => useMentionCandidates('', META, 8), { wrapper });
    expect(all.result.current.map((m) => m.displayName).sort()).toEqual(['Alice', 'Bob']);
    const one = renderHook(() => useMentionCandidates('bo', META, 8), { wrapper });
    expect(one.result.current.map((m) => m.pubkey)).toEqual([BOB]);
    const capped = renderHook(() => useMentionCandidates('', META, 1), { wrapper });
    expect(capped.result.current).toHaveLength(1);
  });
});
