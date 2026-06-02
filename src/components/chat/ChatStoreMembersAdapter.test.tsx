import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';

type Profile = {
  pubkey: string;
  displayName: string | null;
  name: string | null;
  picture: string | null;
  nip05: string | null;
  banner: string | null;
  about: string | null;
  lud16: string | null;
  website: string | null;
  fetchedAt: number;
};

const mockUseAdmins = vi.fn<(g: string | null) => readonly string[]>();
const mockUseMembers = vi.fn<(g: string | null) => readonly string[]>();
const mockUseProfile = vi.fn<(pk: string | null) => Profile | null>();

vi.mock('@/lib/nostr-bridge', () => ({
  useAdmins: (g: string | null) => mockUseAdmins(g),
  useMembers: (g: string | null) => mockUseMembers(g),
}));

vi.mock('@nostr-wot/data/react', () => ({
  useProfile: (pk: string | null) => mockUseProfile(pk),
}));

import ChatStoreMembersAdapter from './ChatStoreMembersAdapter';
import { useChatStore } from '@/store/chat';

function makeProfile(pubkey: string, overrides: Partial<Profile> = {}): Profile {
  return {
    pubkey,
    displayName: null,
    name: null,
    picture: null,
    nip05: null,
    banner: null,
    about: null,
    lud16: null,
    website: null,
    fetchedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  useChatStore.setState(useChatStore.getInitialState());
  mockUseAdmins.mockReset().mockReturnValue([]);
  mockUseMembers.mockReset().mockReturnValue([]);
  mockUseProfile.mockReset().mockReturnValue(null);
});

describe('ChatStoreMembersAdapter', () => {
  it('writes cached profile metadata into memberList even when useProfile resolves before the parent commits setMemberList', async () => {
    // Race regression: useProfile returns a cached entry on the very first
    // render (the common revisit case where the chat panel has already
    // primed the kind:0 store). The child's mount-effect runs before the
    // parent's setMemberList, so without the rowExists dep on
    // MemberMetaSync's effect, the cached metadata never lands in memberList
    // and the row stays as `pubkey.slice(0,10)`.
    //
    // The mock must return a STABLE reference per pubkey. The real
    // useProfile is backed by a memoized store; returning a fresh object
    // each call would make `meta` change reference every render and
    // accidentally re-fire the effect, masking the race entirely.
    const profiles = new Map<string, Profile>([
      [
        'alice',
        makeProfile('alice', {
          displayName: 'Alice',
          name: 'alice',
          picture: 'https://example.com/alice.png',
          nip05: 'alice@example.com',
        }),
      ],
    ]);
    mockUseAdmins.mockReturnValue(['alice']);
    mockUseMembers.mockReturnValue(['bob']);
    mockUseProfile.mockImplementation((pk) => (pk ? profiles.get(pk) ?? null : null));

    render(<ChatStoreMembersAdapter groupId="g1" />);

    await waitFor(() => {
      const list = useChatStore.getState().memberList;
      expect(list).toHaveLength(2);
      const alice = list.find((m) => m.pubkey === 'alice');
      expect(alice?.displayName).toBe('Alice');
      expect(alice?.picture).toBe('https://example.com/alice.png');
      expect(alice?.nip05).toBe('alice@example.com');
    });

    // Bob has no cached profile — falls back to the placeholder slice.
    const bob = useChatStore.getState().memberList.find((m) => m.pubkey === 'bob');
    expect(bob?.displayName).toBe('bob');
    expect(bob?.picture).toBeUndefined();
  });

  it('still applies metadata that arrives after the row is seeded (uncached → relay arrival)', async () => {
    const profiles = new Map<string, Profile>();
    mockUseMembers.mockReturnValue(['alice']);
    mockUseProfile.mockImplementation((pk) => (pk ? profiles.get(pk) ?? null : null));

    const { rerender } = render(<ChatStoreMembersAdapter groupId="g1" />);

    await waitFor(() => {
      const list = useChatStore.getState().memberList;
      expect(list).toHaveLength(1);
      expect(list[0].displayName).toBe('alice');
    });

    // Kind:0 arrives from the relay — useProfile starts returning a value.
    profiles.set(
      'alice',
      makeProfile('alice', {
        displayName: 'Alice Live',
        picture: 'https://example.com/alice.png',
      }),
    );
    rerender(<ChatStoreMembersAdapter groupId="g1" />);

    await waitFor(() => {
      const alice = useChatStore.getState().memberList.find((m) => m.pubkey === 'alice');
      expect(alice?.displayName).toBe('Alice Live');
      expect(alice?.picture).toBe('https://example.com/alice.png');
    });
  });

  it('flips the role on admin promotion without wiping prior metadata', async () => {
    const profiles = new Map<string, Profile>([
      [
        'alice',
        makeProfile('alice', {
          displayName: 'Alice',
          picture: 'https://example.com/alice.png',
        }),
      ],
    ]);
    mockUseMembers.mockReturnValue(['alice']);
    mockUseProfile.mockImplementation((pk) => (pk ? profiles.get(pk) ?? null : null));

    const { rerender } = render(<ChatStoreMembersAdapter groupId="g1" />);
    await waitFor(() => {
      const alice = useChatStore.getState().memberList.find((m) => m.pubkey === 'alice');
      expect(alice?.role).toBe('member');
      expect(alice?.displayName).toBe('Alice');
    });

    // 39001/39002 churn that flips alice into admins — preserve metadata.
    mockUseAdmins.mockReturnValue(['alice']);
    rerender(<ChatStoreMembersAdapter groupId="g1" />);

    await waitFor(() => {
      const alice = useChatStore.getState().memberList.find((m) => m.pubkey === 'alice');
      expect(alice?.role).toBe('admin');
      expect(alice?.displayName).toBe('Alice');
      expect(alice?.picture).toBe('https://example.com/alice.png');
    });
  });

  it('falls back to meta.name when displayName is missing', async () => {
    const profiles = new Map<string, Profile>([
      ['carol', makeProfile('carol', { name: 'carol_user', displayName: null })],
    ]);
    mockUseMembers.mockReturnValue(['carol']);
    mockUseProfile.mockImplementation((pk) => (pk ? profiles.get(pk) ?? null : null));

    render(<ChatStoreMembersAdapter groupId="g1" />);

    await waitFor(() => {
      const carol = useChatStore.getState().memberList.find((m) => m.pubkey === 'carol');
      expect(carol?.displayName).toBe('carol_user');
    });
  });

  it('dedupes pubkeys present in both admins and members', async () => {
    mockUseAdmins.mockReturnValue(['alice']);
    mockUseMembers.mockReturnValue(['alice', 'bob']);
    mockUseProfile.mockReturnValue(null);

    render(<ChatStoreMembersAdapter groupId="g1" />);

    await waitFor(() => {
      const list = useChatStore.getState().memberList;
      expect(list.map((m) => m.pubkey).sort()).toEqual(['alice', 'bob']);
      expect(list.find((m) => m.pubkey === 'alice')?.role).toBe('admin');
      expect(list.find((m) => m.pubkey === 'bob')?.role).toBe('member');
    });
  });
});
