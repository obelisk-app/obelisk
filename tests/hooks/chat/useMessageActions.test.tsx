import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendReaction = vi.fn();
const removeReaction = vi.fn();
const deleteGroupEvent = vi.fn();
const removeMessage = vi.fn();
const retryMessage = vi.fn();
const cancelPendingMessage = vi.fn();
vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    nostrActions: {
      sendReaction: (...a: unknown[]) => sendReaction(...a),
      removeReaction: (...a: unknown[]) => removeReaction(...a),
      deleteGroupEvent: (...a: unknown[]) => deleteGroupEvent(...a),
      removeMessage: (...a: unknown[]) => removeMessage(...a),
      retryMessage: (...a: unknown[]) => retryMessage(...a),
      cancelPendingMessage: (...a: unknown[]) => cancelPendingMessage(...a),
    },
  });
});

const confirmDialog = vi.fn();
vi.mock('@/services/confirm-dialog', () => ({
  confirmDialog: (...a: unknown[]) => confirmDialog(...a),
}));

import { useChatStore } from '@/store/chat';
import { useMessageModeration, useMessageReactions } from '@/hooks/chat/useMessageActions';

const ME = 'b'.repeat(64);
const OTHER = 'c'.repeat(64);
const MSG = { id: 'msg-1', pubkey: 'a'.repeat(64), clientTag: 'tag-1' };
const LABELS = {
  confirmDeleteEveryone: 'Delete for everyone?',
  confirmDeleteEveryoneBody: 'everyone body',
  confirmDeleteOwn: 'Delete your message?',
  confirmDeleteOwnBody: 'own body',
  confirmLabel: 'Delete',
};

beforeEach(() => {
  useChatStore.setState({ serverEmojis: { party: 'https://cdn/party.webp' } });
  for (const fn of [sendReaction, removeReaction, deleteGroupEvent, removeMessage, retryMessage, cancelPendingMessage]) {
    fn.mockResolvedValue(undefined);
  }
});
afterEach(() => vi.clearAllMocks());

describe('useMessageReactions', () => {
  it('groups reactions and knows which ones are mine', () => {
    const { result } = renderHook(() => useMessageReactions(MSG, 'g', [
      { id: 'r1', pubkey: ME, emoji: '🔥' },
      { id: 'r2', pubkey: OTHER, emoji: '🔥' },
      { id: 'r3', pubkey: OTHER, emoji: '👀' },
    ], ME, false));
    expect(result.current.grouped.map((r) => [r.emoji, r.count, r.mine])).toEqual([['🔥', 2, true], ['👀', 1, false]]);
    expect([...result.current.myReactedEmojis]).toEqual(['🔥']);
  });

  it('publishes a new reaction with the custom-emoji tags it needs', async () => {
    const { result } = renderHook(() => useMessageReactions(MSG, 'g', [], ME, false));
    await act(() => result.current.toggle(':party:'));
    expect(sendReaction).toHaveBeenCalledWith('msg-1', MSG.pubkey, ':party:', 'g', [['emoji', 'party', 'https://cdn/party.webp']]);
  });

  it('retracts my own reaction instead of sending a second one', async () => {
    const { result } = renderHook(() => useMessageReactions(MSG, 'g', [{ id: 'r1', pubkey: ME, emoji: '🔥' }], ME, false));
    const mine = result.current.grouped[0];
    await act(() => result.current.toggle(mine.emoji, mine.customEmojis, mine.myReactionId));
    expect(removeReaction).toHaveBeenCalledWith('g', 'r1');
    expect(sendReaction).not.toHaveBeenCalled();
  });

  it('is a no-op when I already reacted with that emoji and no id was given', async () => {
    const { result } = renderHook(() => useMessageReactions(MSG, 'g', [{ id: 'r1', pubkey: ME, emoji: '🔥' }], ME, false));
    await act(() => result.current.toggle('🔥'));
    expect(sendReaction).not.toHaveBeenCalled();
    expect(removeReaction).not.toHaveBeenCalled();
  });

  it('as admin removes every reaction of that emoji for everyone', async () => {
    const { result } = renderHook(() => useMessageReactions(MSG, 'g', [
      { id: 'r2', pubkey: OTHER, emoji: '👀' },
      { id: 'r3', pubkey: 'd'.repeat(64), emoji: '👀' },
    ], ME, true));
    const pill = result.current.grouped[0];
    await act(() => result.current.toggle(pill.emoji, pill.customEmojis, pill.myReactionId, pill.reactionIds));
    expect(deleteGroupEvent).toHaveBeenCalledTimes(2);
    expect(deleteGroupEvent).toHaveBeenCalledWith('g', 'r2');
    expect(deleteGroupEvent).toHaveBeenCalledWith('g', 'r3');
    expect(sendReaction).not.toHaveBeenCalled();
  });

  it('swallows a relay failure instead of leaving an unhandled rejection', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sendReaction.mockRejectedValueOnce(new Error('relay refused'));
    const { result } = renderHook(() => useMessageReactions(MSG, 'g', [], ME, false));
    await expect(act(() => result.current.toggle('🔥'))).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('useMessageModeration', () => {
  it('lets the author and admins delete, nobody else', () => {
    expect(renderHook(() => useMessageModeration(MSG, 'g', false, true, LABELS)).result.current.canDelete).toBe(true);
    expect(renderHook(() => useMessageModeration(MSG, 'g', true, false, LABELS)).result.current.canDelete).toBe(true);
    expect(renderHook(() => useMessageModeration(MSG, 'g', false, false, LABELS)).result.current.canDelete).toBe(false);
    expect(renderHook(() => useMessageModeration(MSG, null, true, false, LABELS)).result.current.canDelete).toBe(false);
  });

  it('admin delete confirms with the everyone copy and publishes kind 9005', async () => {
    confirmDialog.mockResolvedValueOnce(true);
    const { result } = renderHook(() => useMessageModeration(MSG, 'g', true, false, LABELS));
    await expect(act(() => result.current.deleteMessage())).resolves.toBe(true);
    expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ title: 'Delete for everyone?', confirmLabel: 'Delete' }));
    expect(deleteGroupEvent).toHaveBeenCalledWith('g', 'msg-1');
    expect(removeMessage).not.toHaveBeenCalled();
  });

  it('own delete confirms with the own copy and publishes NIP-09', async () => {
    confirmDialog.mockResolvedValueOnce(true);
    const { result } = renderHook(() => useMessageModeration(MSG, 'g', false, true, LABELS));
    await act(() => result.current.deleteMessage());
    expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ title: 'Delete your message?' }));
    expect(removeMessage).toHaveBeenCalledWith('g', 'msg-1');
    expect(deleteGroupEvent).not.toHaveBeenCalled();
  });

  it('a cancelled confirm deletes nothing', async () => {
    confirmDialog.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useMessageModeration(MSG, 'g', true, false, LABELS));
    await expect(act(() => result.current.deleteMessage())).resolves.toBe(false);
    expect(deleteGroupEvent).not.toHaveBeenCalled();
  });

  it('retry and dismiss need the optimistic client tag', () => {
    const { result } = renderHook(() => useMessageModeration(MSG, 'g', false, false, LABELS));
    act(() => result.current.retry());
    act(() => result.current.dismissFailed());
    expect(retryMessage).toHaveBeenCalledWith('g', 'tag-1');
    expect(cancelPendingMessage).toHaveBeenCalledWith('g', 'tag-1');

    const untagged = renderHook(() => useMessageModeration({ ...MSG, clientTag: null }, 'g', false, false, LABELS));
    act(() => untagged.result.current.retry());
    expect(retryMessage).toHaveBeenCalledTimes(1);
  });
});
