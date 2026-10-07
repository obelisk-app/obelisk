import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { useMessageZapForm } from '@/hooks/chat/zaps/useMessageZapForm';
import { DEFAULT_ZAP_AMOUNT_SATS } from '@/services/wallet/zap-constants';

const R = 'c'.repeat(64);

describe('useMessageZapForm', () => {
  it('starts at the target amount (or the default) and reads a non-number as 0, which cannot be sent', () => {
    const wrapper = bridgeWrapper(fakeBridge({}, { getNipSigner: () => null }));
    const own = renderHook(() => useMessageZapForm({ recipientPubkey: R, displayName: 'Ana', groupId: 'g', defaultAmountSats: 500 }, () => {}), { wrapper });
    expect(own.result.current.amount).toBe(500);
    const { result } = renderHook(() => useMessageZapForm({ recipientPubkey: R, displayName: 'Ana', groupId: 'g' }, () => {}), { wrapper });
    expect(result.current.amount).toBe(DEFAULT_ZAP_AMOUNT_SATS);
    act(() => result.current.setAmountText('abc'));
    expect(result.current.amount).toBe(0);
    expect(result.current.canSend).toBe(false);
    act(() => result.current.setAmountText('42'));
    expect(result.current.amount).toBe(42);
  });

  it('prefers the recipient\'s kind 0 for name and address, falling back to the target', () => {
    const wrapper = bridgeWrapper(fakeBridge({ userMetadata: { [R]: { name: 'ana', lud16: 'ana@x.example' } } as never }, { getNipSigner: () => null }));
    const { result } = renderHook(() => useMessageZapForm({ recipientPubkey: R, groupId: 'g', displayName: 'Old', recipientLud16: 'old@x' }, () => {}), { wrapper });
    expect(result.current.displayName).toBe('ana');
    expect(result.current.lud16).toBe('ana@x.example');
    const bare = renderHook(() => useMessageZapForm({ recipientPubkey: R, groupId: 'g', displayName: 'Old', recipientLud16: 'old@x' }, () => {}), { wrapper: bridgeWrapper(fakeBridge({}, { getNipSigner: () => null })) });
    expect(bare.result.current.displayName).toBe('Old');
    expect(bare.result.current.lud16).toBe('old@x');
  });
});
