import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { userMetadataFixture } from '@tests/support/mocks/nostr-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useModerationStore } from '@/store/moderation';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { useModerationRow } from '@/hooks/settings/privacy/useModerationRow';

const NAMED = 'a'.repeat(64);
const STRANGER = 'b'.repeat(64);
const wrapper = bridgeWrapper(fakeBridge({
  userMetadata: { [NAMED]: userMetadataFixture({ pubkey: NAMED, displayName: 'Mallory', name: 'mallory' }) },
}));

beforeEach(() => {
  useModerationStore.setState({ mutedPubkeys: [NAMED], blockedPubkeys: [STRANGER] });
});

describe('useModerationRow', () => {
  it('names the person, or falls back to the short npub', () => {
    expect(renderHook(() => useModerationRow(NAMED, 'mute'), { wrapper }).result.current.name).toBe('Mallory');
    expect(renderHook(() => useModerationRow(STRANGER, 'block'), { wrapper }).result.current.name).toBe(shortNpubLabel(STRANGER));
  });

  it('undo lifts the mute or the block it stands for', () => {
    const muted = renderHook(() => useModerationRow(NAMED, 'mute'), { wrapper }).result;
    act(() => muted.current.undo());
    expect(useModerationStore.getState().mutedPubkeys).toEqual([]);
    expect(useModerationStore.getState().blockedPubkeys).toEqual([STRANGER]);
    const blocked = renderHook(() => useModerationRow(STRANGER, 'block'), { wrapper }).result;
    act(() => blocked.current.undo());
    expect(useModerationStore.getState().blockedPubkeys).toEqual([]);
  });
});
