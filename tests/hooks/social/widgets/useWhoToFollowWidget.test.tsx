import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useWhoToFollowWidget } from '@/hooks/social/widgets/useWhoToFollowWidget';
import { WHO_TO_FOLLOW_LIMIT } from '@/constants/social/widgets';

const hex = (c: string) => c.repeat(64);
const note = (id: string, pubkey: string): NostrEvent => ({
  id, pubkey, kind: 1, content: '', created_at: 1, sig: '', tags: [],
});
/** Two posts each: an author seen once is noise, not a suggestion. */
const twice = (pubkey: string) => [note(`${pubkey}1`, pubkey), note(`${pubkey}2`, pubkey)];

describe('useWhoToFollowWidget', () => {
  it('suggests authors in the window that are not followed and not me', () => {
    const fake = fakeBridge({
      myPubkey: hex('a'),
      myContactList: { id: 'c', pubkey: hex('a'), kind: 3, content: '', created_at: 1, sig: '', tags: [['p', hex('b')]] },
    });
    const notes = [...twice(hex('a')), ...twice(hex('b')), ...twice(hex('c'))];
    const { result } = renderHook(() => useWhoToFollowWidget(notes), { wrapper: bridgeWrapper(fake) });
    expect(result.current.people.map((p) => p.pubkey)).toEqual([hex('c')]);
  });

  it('caps the suggestions', () => {
    const fake = fakeBridge({ myPubkey: null });
    const notes = '0123456789'.split('').flatMap((c) => twice(hex(c)));
    const { result } = renderHook(() => useWhoToFollowWidget(notes), { wrapper: bridgeWrapper(fake) });
    expect(result.current.people).toHaveLength(WHO_TO_FOLLOW_LIMIT);
  });
});
