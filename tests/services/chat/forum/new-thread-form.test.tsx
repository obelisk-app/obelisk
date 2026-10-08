import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useChatStore } from '@/store/chat';
import { useForm } from '@/hooks/common/useForm';
import { newThreadForm, type NewThreadTarget } from '@/services/chat/forum/new-thread-form';
import { toggleThreadTag } from '@/utils/chat/forum/forum-tags';

const createGroup = vi.fn();
const sendMessage = vi.fn();
const wrapper = bridgeWrapper(fakeBridge({}, {
  createGroup: (...a: unknown[]) => createGroup(...a),
  sendMessage: (...a: unknown[]) => sendMessage(...a),
} as never));

const ACCESS = { isPublic: true, isHidden: false, isRestricted: false, isOpen: true };
const ME = 'a'.repeat(64);

function target(over: Partial<NewThreadTarget> = {}): NewThreadTarget {
  return { forumGroupId: 'forum', access: ACCESS, initialTitle: '', signerReady: true, myPubkey: ME, onCreated: () => {}, ...over };
}

beforeEach(() => useChatStore.setState({ serverEmojis: { party: 'https://cdn/party.webp' } }));
afterEach(() => {
  createGroup.mockReset();
  sendMessage.mockReset();
});

describe('newThreadForm', () => {
  it('cannot submit until title and body are filled and the signer is ready', () => {
    let ready = true;
    const { result, rerender } = renderHook(() => useForm(newThreadForm(target({ signerReady: ready }))), { wrapper });
    expect(result.current.canSubmit).toBe(false);
    act(() => result.current.setValues({ title: 'Hello', body: 'World' }));
    expect(result.current.canSubmit).toBe(true);
    ready = false;
    rerender();
    expect(result.current.canSubmit).toBe(false);
  });

  it('caps the tag selection at five and toggles off', () => {
    let tags: ReadonlyArray<string> = [];
    for (const id of ['1', '2', '3', '4', '5', '6']) tags = toggleThreadTag(tags, id, 5);
    expect(tags).toEqual(['1', '2', '3', '4', '5']);
    expect(toggleThreadTag(tags, '3', 5)).toEqual(['1', '2', '4', '5']);
  });

  it('creates the child group under the forum with the forum access flags, then posts the OP with emoji tags', async () => {
    createGroup.mockResolvedValueOnce('rly/child');
    sendMessage.mockResolvedValueOnce(undefined);
    const onCreated = vi.fn();
    const spec = target({ forumGroupId: 'rly/forum', access: { ...ACCESS, isRestricted: true }, initialTitle: ' Title ', onCreated });
    const { result } = renderHook(() => useForm(newThreadForm(spec)), { wrapper });
    act(() => result.current.setValues({ body: ' hello :party: ', tagIds: ['t1'] }));
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
    const first = renderHook(() => useForm(newThreadForm(target({ myPubkey: null, initialTitle: 'T' }))), { wrapper });
    act(() => first.result.current.set('body', 'B'));
    await act(() => first.result.current.submit());
    expect(createGroup).not.toHaveBeenCalled();

    createGroup.mockRejectedValueOnce(new Error('relay said no'));
    const onCreated = vi.fn();
    const second = renderHook(() => useForm(newThreadForm(target({ initialTitle: 'T', onCreated }))), { wrapper });
    act(() => second.result.current.set('body', 'B'));
    await act(() => second.result.current.submit());
    expect(second.result.current.error).toBe('Could not create the publication.');
    expect(sendMessage).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
