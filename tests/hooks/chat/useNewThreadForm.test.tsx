import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createGroup = vi.fn();
const sendMessage = vi.fn();
let signerReady = true;
let myPubkey: string | null = 'a'.repeat(64);
vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    nostrActions: {
      createGroup: (...a: unknown[]) => createGroup(...a),
      sendMessage: (...a: unknown[]) => sendMessage(...a),
    },
    useSignerReady: () => signerReady,
    useMyPubkey: () => myPubkey,
  });
});

import { useChatStore } from '@/store/chat';
import { useNewThreadForm } from '@/hooks/chat/useNewThreadForm';
import { LocaleProvider } from '@tests/support/intl';
import type { ReactNode } from 'react';

/** The hook words its errors through next-intl, so it needs a provider. */
const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;


const ACCESS = { isPublic: true, isHidden: false, isRestricted: false, isOpen: true };

beforeEach(() => {
  signerReady = true;
  myPubkey = 'a'.repeat(64);
  useChatStore.setState({ serverEmojis: { party: 'https://cdn/party.webp' } });
});
afterEach(() => {
  createGroup.mockReset();
  sendMessage.mockReset();
});

describe('useNewThreadForm', () => {
  it('cannot submit until title and body are filled and the signer is ready', () => {
    const { result, rerender } = renderHook(() => useNewThreadForm('forum', ACCESS, '', () => {}), { wrapper });
    expect(result.current.canSubmit).toBe(false);
    act(() => { result.current.setTitle('Hello'); result.current.setBody('World'); });
    expect(result.current.canSubmit).toBe(true);
    signerReady = false;
    rerender();
    expect(result.current.canSubmit).toBe(false);
  });

  it('caps the tag selection at five and toggles off', () => {
    const { result } = renderHook(() => useNewThreadForm('forum', ACCESS, '', () => {}), { wrapper });
    for (const id of ['1', '2', '3', '4', '5', '6']) act(() => result.current.toggleTag(id));
    expect(result.current.selectedTagIds).toEqual(['1', '2', '3', '4', '5']);
    act(() => result.current.toggleTag('3'));
    expect(result.current.selectedTagIds).toEqual(['1', '2', '4', '5']);
  });

  it('creates the child group under the forum with the forum access flags, then posts the OP with emoji tags', async () => {
    createGroup.mockResolvedValueOnce('rly/child');
    sendMessage.mockResolvedValueOnce(undefined);
    const onCreated = vi.fn();
    const { result } = renderHook(() => useNewThreadForm('rly/forum', { ...ACCESS, isRestricted: true }, ' Title ', onCreated), { wrapper });
    act(() => { result.current.setBody(' hello :party: '); result.current.toggleTag('t1'); });
    await act(() => result.current.submit());
    expect(createGroup).toHaveBeenCalledWith({
      name: 'Title',
      about: undefined,
      isPublic: true,
      isHidden: false,
      isRestricted: true,
      isOpen: true,
      parent: 'rly/forum',
      topics: ['t1'],
    });
    expect(sendMessage).toHaveBeenCalledWith('rly/child', 'hello :party:', null, [
      ['emoji', 'party', 'https://cdn/party.webp'],
    ]);
    expect(onCreated).toHaveBeenCalledWith('rly/child');
  });

  it('does nothing without a pubkey and reports a failed create', async () => {
    myPubkey = null;
    const first = renderHook(() => useNewThreadForm('f', ACCESS, 'T', () => {}), { wrapper });
    act(() => first.result.current.setBody('B'));
    await act(() => first.result.current.submit());
    expect(createGroup).not.toHaveBeenCalled();

    myPubkey = 'a'.repeat(64);
    createGroup.mockRejectedValueOnce(new Error('relay said no'));
    const onCreated = vi.fn();
    const second = renderHook(() => useNewThreadForm('f', ACCESS, 'T', onCreated), { wrapper });
    act(() => second.result.current.setBody('B'));
    await act(() => second.result.current.submit());
    expect(second.result.current.error).toBe('Could not create the publication.');
    expect(sendMessage).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
