import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useMessageAuthor } from '@/hooks/chat/message/useMessageAuthor';

const ME = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

/** Every value the hook returned, first render included. */
function renders(pubkey: string) {
  const seen: Array<string | null> = [];
  const bridge = fakeBridge({
    myPubkey: ME,
    userMetadata: { [ME]: { name: 'Capitan' } as never, [OTHER]: { name: 'Bea' } as never },
  });
  renderHook(() => {
    const meta = useMessageAuthor(pubkey);
    seen.push(meta?.name ?? null);
    return meta;
  }, { wrapper: bridgeWrapper(bridge) });
  return seen;
}

describe('useMessageAuthor', () => {
  it('draws your own message from the session profile on its very first render', () => {
    expect(renders(ME)[0]).toBe('Capitan');
  });

  it('settles on the bridge profile for anyone else', () => {
    expect(renders(OTHER).at(-1)).toBe('Bea');
  });

  it('requests an author profile when a message arrives without bridge ingest', () => {
    const ensureUserMetadata = vi.fn();
    const bridge = fakeBridge({ myPubkey: ME }, { ensureUserMetadata });
    renderHook(() => useMessageAuthor(OTHER), { wrapper: bridgeWrapper(bridge) });
    expect(ensureUserMetadata).toHaveBeenCalledWith(OTHER);
  });

  it('does not lend your profile to someone else on the first render', () => {
    expect(renders(OTHER)[0]).toBeNull();
  });
});
