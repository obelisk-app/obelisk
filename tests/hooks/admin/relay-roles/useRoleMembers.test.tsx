import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { nip19 } from 'nostr-tools';
import { groupFixture, userMetadataFixture } from '@tests/support/mocks/nostr-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useRoleMembers } from '@/hooks/admin/relay-roles/useRoleMembers';

const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);
const STRANGER = 'f'.repeat(64);

function setup(holders: readonly string[] = [], people = true) {
  const bridge = fakeBridge(people ? {
    groups: [groupFixture({ id: 'g' })],
    membersByGroup: { g: [ALICE, BOB] },
    userMetadata: {
      [ALICE]: userMetadataFixture({ pubkey: ALICE, displayName: 'Alice' }),
      [BOB]: userMetadataFixture({ pubkey: BOB, displayName: 'Bob' }),
    },
  } : {}, { ensureUserMetadata: vi.fn() });
  const onGrant = vi.fn();
  const onError = vi.fn();
  const hook = renderHook(() => useRoleMembers({ holders, onGrant, onError }), { wrapper: bridgeWrapper(bridge) });
  return { ...hook, onGrant, onError };
}

describe('useRoleMembers', () => {
  it('offers the relay members who do not hold the role, filtered by the search', async () => {
    const { result } = setup([BOB]);
    await waitFor(() => expect(result.current.matches.map((p) => p.pubkey)).toEqual([ALICE]));
    expect(result.current.loadingPeople).toBe(false);
    act(() => result.current.setQuery('zzz'));
    expect(result.current.matches).toEqual([]);
  });

  it('says the people are still loading while the relay has none', () => {
    expect(setup([], false).result.current.loadingPeople).toBe(true);
  });

  it('grants to a listed person and clears the search', async () => {
    const { result, onGrant } = setup();
    act(() => result.current.setQuery('ali'));
    act(() => result.current.grantPerson(ALICE));
    expect(onGrant).toHaveBeenCalledWith(ALICE);
    expect(result.current.query).toBe('');
  });

  it('grants to a pasted stranger on Enter, and only then', () => {
    const { result, onGrant } = setup();
    act(() => result.current.setQuery(nip19.npubEncode(STRANGER)));
    expect(result.current.pastedIsNew).toBe(true);
    expect(result.current.pasted).toBe(STRANGER);
    act(() => result.current.onQueryKey('a'));
    expect(onGrant).not.toHaveBeenCalled();
    act(() => result.current.onQueryKey('Enter'));
    expect(onGrant).toHaveBeenCalledWith(STRANGER);
    expect(result.current.query).toBe('');
  });

  it('Enter on a search that is not a key does nothing; granting it reports no match', () => {
    const { result, onGrant, onError } = setup();
    act(() => result.current.setQuery('bob'));
    expect(result.current.pasted).toBe('');
    act(() => result.current.onQueryKey('Enter'));
    expect(onGrant).not.toHaveBeenCalled();
    act(() => result.current.grantPasted());
    expect(onError).toHaveBeenCalledWith('No match: search by name, or paste an npub or hex pubkey.');
    expect(result.current.query).toBe('bob');
  });
});
