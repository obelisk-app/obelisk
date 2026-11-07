import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMessageReactions } from '@/hooks/chat/message/useMessageActions';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { setPreference } from '@/services/preferences/preferences';
import { DEFAULT_ZAP_PRESETS } from '@/constants/wallet/zap';

const pay = vi.hoisted(() => vi.fn(async () => true));
vi.mock('@/hooks/chat/zaps/useQuickZap', () => ({ useQuickZap: () => pay }));
const message = { id: 'message', pubkey: 'c'.repeat(64) };
beforeEach(() => { pay.mockClear(); setPreference('zapPresets', DEFAULT_ZAP_PRESETS); });

describe('configured zap reactions', () => {
  it('pays the configured amount even when a plain reaction already exists', async () => {
    const bridge = fakeBridge();
    const { result } = renderHook(() => useMessageReactions(message, 'g', [
      { id: 'plain', pubkey: 'me', emoji: '🔥' },
      { id: 'marker', pubkey: 'me', emoji: '⚡', zapMarker: true },
    ], 'me'), { wrapper: bridgeWrapper(bridge) });
    expect(result.current.grouped.map((r) => r.emoji)).toEqual(['🔥']);
    await act(async () => { await result.current.toggle('🔥', {}, 'plain'); });
    expect(pay).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'message', recipientPubkey: message.pubkey }), 100);
  });

  it('uses updated settings for the next emoji payment', async () => {
    setPreference('zapPresets', [{ emoji: '⚡', amountSats: 42 }]);
    const { result } = renderHook(() => useMessageReactions(message, 'g', [], 'me'), { wrapper: bridgeWrapper(fakeBridge()) });
    await act(async () => { await result.current.toggle('⚡'); });
    expect(pay).toHaveBeenCalledWith(expect.anything(), 42);
    setPreference('zapPresets', DEFAULT_ZAP_PRESETS);
  });
  it('matches the same paid emoji with or without a presentation selector', async () => {
    setPreference('zapPresets', [{ emoji: '⚡', amountSats: 21 }, { emoji: '❤️', amountSats: 500 }]);
    const { result } = renderHook(() => useMessageReactions(message, 'g', [], 'me'), { wrapper: bridgeWrapper(fakeBridge()) });
    await act(async () => { await result.current.toggle('❤'); });
    expect(pay).toHaveBeenCalledWith(expect.anything(), 500);
    setPreference('zapPresets', DEFAULT_ZAP_PRESETS);
  });

});
