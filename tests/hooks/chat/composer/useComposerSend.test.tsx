import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LocaleProvider } from '@tests/support/intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JsGroup, JsMessage } from '@/services/nostr-bridge';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';

const sendMessage = vi.fn(() => Promise.resolve());
const joinGroup = vi.fn(() => Promise.resolve());
const ME = 'b'.repeat(64);
let members: string[] = [];

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    nostrActions: { sendMessage: (...a: unknown[]) => sendMessage(...(a as [])), joinGroup: (...a: unknown[]) => joinGroup(...(a as [])) },
    useMyPubkey: () => ME,
    useRelayAccess: () => 'ok',
    useAdmins: () => [],
    useMembers: () => members,
  });
});

import { useComposerSend, type ComposerDraftState } from '@/hooks/chat/composer/useComposerSend';

function state(draft: string): ComposerDraftState {
  return {
    draft,
    setDraft: vi.fn(),
    setSendError: vi.fn(),
    draftMentions: [],
    setDraftMentions: vi.fn(),
    serverEmojis: {},
    draftCustomEmojis: {},
    setDraftCustomEmojis: vi.fn(),
    draftSticker: null,
    setDraftSticker: vi.fn(),
    draftVoiceNote: null,
    setDraftVoiceNote: vi.fn(),
  };
}

/** The hook words its errors through next-intl, so it needs a provider. */
const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;

function run(draft: string, group: JsGroup | null = groupFixture({ id: 'g', isOpen: false }), onOpenNewGame = vi.fn()) {
  const s = state(draft);
  const setReplyingTo = vi.fn();
  const { result } = renderHook(() => useComposerSend({
    groupId: 'g', group, relay: 'wss://r', messages: [] as JsMessage[], replyingTo: null, setReplyingTo, onOpenNewGame, state: s,
  }), { wrapper });
  return { send: result.current, s, setReplyingTo, onOpenNewGame };
}

describe('useComposerSend', () => {
  beforeEach(() => { vi.clearAllMocks(); members = []; });

  it('an empty draft sends nothing', async () => {
    const { send } = run('   ');
    await act(async () => { await send(); });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('/play opens the game picker instead of sending', async () => {
    const { send, onOpenNewGame, s } = run('/play');
    await act(async () => { await send(); });
    expect(onOpenNewGame).toHaveBeenCalled();
    expect(s.setDraft).toHaveBeenCalledWith('');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('sends the trimmed text and clears the draft', async () => {
    const { send, s, setReplyingTo } = run(' hello ');
    await act(async () => { await send(); });
    expect(sendMessage).toHaveBeenCalledWith('g', 'hello', null, []);
    expect(s.setDraft).toHaveBeenCalledWith('');
    expect(setReplyingTo).toHaveBeenCalledWith(null);
  });

  it('an open group joins first; a rejected join keeps the draft and reports', async () => {
    joinGroup.mockRejectedValueOnce(new Error('user rejected'));
    const { send, s } = run('hi', groupFixture({ id: 'g', isOpen: true }));
    await act(async () => { await send(); });
    expect(joinGroup).toHaveBeenCalledWith('g');
    expect(s.setSendError).toHaveBeenLastCalledWith('Could not join this channel');
    expect(s.setDraft).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('a member of an open group does not join again', async () => {
    members = [ME];
    const { send } = run('hi', groupFixture({ id: 'g', isOpen: true }));
    await act(async () => { await send(); });
    expect(joinGroup).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalled();
  });
});
