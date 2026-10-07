import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { OBELISK_SIGNING_KINDS } from '@/utils/nostr/nostr-signing-kinds';
import { useDeveloperSignatureTest } from '@/hooks/settings/account/useDeveloperSignatureTest';

describe('useDeveloperSignatureTest', () => {
  it('asks for every kind and counts the answers', async () => {
    const signEventTemplate = vi.fn(async (template: { kind: number }) => {
      if (template.kind === 1) throw new Error('refused');
      return { id: 'signed' };
    });
    const bridge = fakeBridge({}, { signEventTemplate } as never);
    const { result } = renderHook(() => useDeveloperSignatureTest(), { wrapper: bridgeWrapper(bridge) });
    expect(result.current.requested).toBe(0);
    expect(result.current.total).toBe(OBELISK_SIGNING_KINDS.length);
    act(() => result.current.run());
    expect(result.current.running).toBe(true);
    await waitFor(() => expect(result.current.running).toBe(false));
    expect(result.current.requested).toBe(OBELISK_SIGNING_KINDS.length);
    expect(result.current.accepted).toBe(OBELISK_SIGNING_KINDS.length - 1);
    expect(result.current.rejected).toBe(1);
  });

  it('flips the relay-log preference', () => {
    const { result } = renderHook(() => useDeveloperSignatureTest(), { wrapper: bridgeWrapper(fakeBridge()) });
    const before = result.current.relayDebug;
    act(() => result.current.toggleRelayDebug());
    expect(result.current.relayDebug).toBe(!before);
    act(() => result.current.toggleRelayDebug());
    expect(result.current.relayDebug).toBe(before);
  });
});
