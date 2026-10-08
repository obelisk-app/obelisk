import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The payment itself is faked: no wallet, LNURL endpoint or relay is reached.
const zap = vi.hoisted(() => ({ sendZap: vi.fn() }));
vi.mock('@/services/wallet/send-zap', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/wallet/send-zap')>();
  return {
    ...real,
    checkZap: (draft: import('@/services/wallet/send-zap').ZapDraft) => ({
      ok: true as const,
      zap: { ...draft, lud16: 'ana@example.com', signer: { pubkey: 'a'.repeat(64), signEvent: vi.fn() } },
    }),
    sendZap: zap.sendZap,
  };
});

import { useSendZap } from '@/hooks/chat/zaps/useSendZap';
import { NwcError } from '@nostr-wot/wallet/nwc';
import { useToastStore } from '@/store/feedback/toast';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

function renderSend(onSent = vi.fn()) {
  const hook = renderHook(() => useSendZap({
    recipient: { recipientPubkey: 'c'.repeat(64), groupId: 'g1', messageId: 'm1' },
    amountSats: 21,
    comment: '',
    lud16: 'ana@example.com',
    displayName: 'Ana',
    onSent,
  }), { wrapper: bridgeWrapper(fakeBridge({}, { getNipSigner: () => null })) });
  return { ...hook, onSent };
}

let pushToast: ReturnType<typeof useToastStore.getState>['pushToast'];

beforeEach(() => {
  pushToast = useToastStore.getState().pushToast;
  zap.sendZap.mockResolvedValue({ markerError: null });
});

afterEach(() => {
  useToastStore.setState({ pushToast });
  vi.clearAllMocks();
});

describe('useSendZap', () => {
  it('pays once when Zap is pressed twice before the button re-renders', async () => {
    const { result, onSent } = renderSend();
    await act(async () => {
      void result.current.send();
      void result.current.send();
    });
    expect(zap.sendZap).toHaveBeenCalledTimes(1);
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it('shows no error and stays disabled when the toast fails after the zap was paid', async () => {
    useToastStore.setState({ pushToast: () => { throw new Error('toast broke'); } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result, onSent } = renderSend();

    await act(async () => { await result.current.send(); });

    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(true);
    expect(onSent).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.send(); });
    expect(zap.sendZap).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('re-enables Zap with a translated error when the payment failed', async () => {
    zap.sendZap.mockRejectedValueOnce(new Error('insufficient balance'));
    const { result, onSent } = renderSend();

    await act(async () => { await result.current.send(); });

    expect(result.current.error).toBe('The zap did not go through.');
    expect(result.current.busy).toBe(false);
    expect(onSent).not.toHaveBeenCalled();
    await act(async () => { await result.current.send(); });
    expect(zap.sendZap).toHaveBeenCalledTimes(2);
  });

  it('keeps Zap disabled when the wallet went silent after the request was sent, so a retry cannot pay twice', async () => {
    zap.sendZap.mockRejectedValueOnce(new NwcError('wallet-timeout', 'unknown'));
    const { result, onSent } = renderSend();

    await act(async () => { await result.current.send(); });

    expect(result.current.error).toBe('Your wallet did not confirm this zap. Check your wallet before zapping again.');
    expect(result.current.unconfirmed).toBe(true);
    expect(onSent).not.toHaveBeenCalled();
    await act(async () => { await result.current.send(); });
    expect(zap.sendZap).toHaveBeenCalledTimes(1);
  });

  it('lets a wallet error that moved no money be retried', async () => {
    zap.sendZap.mockRejectedValueOnce(new NwcError('wallet-insufficient-balance', 'not-paid', 'INSUFFICIENT_BALANCE'));
    const { result } = renderSend();

    await act(async () => { await result.current.send(); });

    expect(result.current.error).toBe('Your wallet does not have enough funds.');
    expect(result.current.unconfirmed).toBe(false);
    await act(async () => { await result.current.send(); });
    expect(zap.sendZap).toHaveBeenCalledTimes(2);
  });
});
