import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { nostrActions } from '@/services/nostr-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { userMetadataFixture } from '@tests/support/mocks/nostr-bridge';
const social = vi.hoisted(() => ({ createdAt: 20, name: 'New', lud16: null }));
vi.mock('@/hooks/social/profile/useSocialProfile', () => ({ useSocialProfile: () => social }));
afterEach(() => vi.restoreAllMocks());
describe('author revision selection', () => {
  it('prefers the newest profile and respects removed fields', () => {
    vi.spyOn(nostrActions, 'ensureUserMetadata').mockResolvedValue(undefined);
    const pubkey = 'a'.repeat(64);
    const bridge = fakeBridge({ userMetadata: { [pubkey]: userMetadataFixture({ pubkey, createdAt: 10, name: 'Old', lud16: 'old@example.com' }) } });
    const { result } = renderHook(() => useAuthor(pubkey), { wrapper: bridgeWrapper(bridge) });
    expect(result.current).toMatchObject({ name: 'New', lud16: null });
    act(() => bridge.stores.userMetadata.set({ [pubkey]: userMetadataFixture({ pubkey, createdAt: 30, name: 'Newest', lud16: 'latest@example.com' }) }));
    expect(result.current).toMatchObject({ name: 'Newest', lud16: 'latest@example.com' });
  });
});
