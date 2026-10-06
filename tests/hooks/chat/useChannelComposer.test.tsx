import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import type { JsGroup, JsMessage, JsUserMetadata, RelayAccessState } from '@/services/nostr-bridge';
import { StateStore } from '@/services/nostr-bridge/state-store';
import { groupFixture, userMetadataFixture } from '@tests/support/mocks/nostr-bridge';

const sendMessage = vi.fn();
const joinGroup = vi.fn();
let members: string[] = [];
let admins: string[] = [];
let relayAccess: RelayAccessState = 'ok';
const ME = 'b'.repeat(64);
const ALICE = 'a'.repeat(64);

// A bridge impl whose metadata store knows Alice, so the mention picker has
// a name to match against (it reads names from the raw store, not a hook).
const METADATA = { [ALICE]: userMetadataFixture({ pubkey: ALICE, displayName: 'Alice', name: 'alice' }) };
const bridgeImpl = {
  userMetadata: new StateStore<Record<string, JsUserMetadata>>(METADATA),
  membersByGroup: new StateStore<Record<string, string[]>>({ g: [ALICE] }),
  subscribeUserMetadata: () => () => {},
};

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    getBridge: () => Promise.resolve(bridgeImpl),
    getBridgeImpl: () => bridgeImpl,
    nostrActions: {
      sendMessage: (...a: unknown[]) => sendMessage(...a),
      joinGroup: (...a: unknown[]) => joinGroup(...a),
    },
    useMyPubkey: () => ME,
    useCurrentRelayUrl: () => 'wss://relay.example',
    useRelayAccess: () => relayAccess,
    useAdmins: () => admins,
    useMembers: () => members,
    useGroups: () => [groupFixture({ id: 'g' })],
    useMembersByGroup: () => ({ g: [ALICE] }),
    useAdminsByGroup: () => ({}),
    useGroupCreators: () => ({}),
  });
});

const uploadToBlossom = vi.fn();
vi.mock('@/services/blossom', () => ({ uploadToBlossom: (...a: unknown[]) => uploadToBlossom(...a) }));
vi.mock('@/services/bot-commands', async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  return { ...actual, useBotCommands: () => [] };
});

import { useChannelComposer } from '@/hooks/chat/useChannelComposer';
import { useMessageZapStore } from '@/store/messageZap';
import { useChatStore } from '@/store/chat';

const GROUP: JsGroup = {
  id: 'g', name: 'general', about: null, picture: null, banner: null,
  isPublic: true, isHidden: false, isRestricted: false, isOpen: true,
  parent: null, kind: 'text', forumTags: [], topics: [],
};
const MSG: JsMessage = {
  id: 'm1', pubkey: ALICE, content: 'hi', createdAt: 1_700_000_000, kind: 9, replyToId: null, mentions: [],
} as JsMessage;

function mount(overrides: Partial<Parameters<typeof useChannelComposer>[0]> = {}) {
  const inputRef = createRef<HTMLInputElement>();
  const setReplyingTo = vi.fn();
  const onOpenNewGame = vi.fn();
  const hook = renderHook(() => useChannelComposer({
    groupId: 'g',
    group: GROUP,
    messages: [MSG],
    replyingTo: null,
    setReplyingTo,
    inputRef,
    onOpenNewGame,
    ...overrides,
  }));
  return { ...hook, setReplyingTo, onOpenNewGame };
}

beforeEach(() => {
  members = [ME];
  admins = [];
  relayAccess = 'ok';
  sendMessage.mockResolvedValue(undefined);
  joinGroup.mockResolvedValue(undefined);
  uploadToBlossom.mockResolvedValue('https://blossom/x.png');
  useChatStore.setState({ serverEmojis: { party: 'https://cdn/party.webp' } });
  useMessageZapStore.setState({ target: null });
});
afterEach(() => vi.clearAllMocks());

describe('useChannelComposer: send', () => {
  it('resolves @Name mentions to nostr: tokens and carries emoji tags', async () => {
    const { result, setReplyingTo } = mount();
    // Let the metadata subscription (behind getBridge()) deliver Alice.
    await act(async () => { await Promise.resolve(); });
    act(() => result.current.onInput('@al', 3));
    expect(result.current.mentionQuery).toBe('al');
    expect(result.current.filteredMembers.map((m) => m.pubkey)).toEqual([ALICE]);
    act(() => result.current.applyMention(result.current.filteredMembers[0]));
    expect(result.current.mentionQuery).toBeNull();
    act(() => result.current.onInput(`${result.current.draft}:party:`, result.current.draft.length + 7));
    await act(() => result.current.send());
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [groupId, wire, reply, tags] = sendMessage.mock.calls[0] as [string, string, unknown, string[][]];
    expect(groupId).toBe('g');
    expect(wire).toMatch(/^nostr:npub1/);
    expect(wire).not.toContain('@');
    expect(reply).toBeNull();
    expect(tags).toContainEqual(['emoji', 'party', 'https://cdn/party.webp']);
    expect(result.current.draft).toBe('');
    expect(setReplyingTo).toHaveBeenCalledWith(null);
  });

  it('/zap opens the zap modal without publishing anything', async () => {
    const { result } = mount();
    act(() => result.current.onInput('/zap 21', 7));
    await act(() => result.current.send());
    expect(sendMessage).not.toHaveBeenCalled();
    const target = useMessageZapStore.getState().target;
    expect(target).not.toBeNull();
    expect(target?.recipientPubkey).toBe(ALICE);
    expect(result.current.draft).toBe('');
  });

  it('/zap with no target shows the parser error in the composer', async () => {
    const { result } = mount({ messages: [] });
    act(() => result.current.onInput('/zap', 4));
    await act(() => result.current.send());
    expect(sendMessage).not.toHaveBeenCalled();
    expect(result.current.sendError).toBeTruthy();
    expect(result.current.draft).toBe('/zap');
  });

  it('/play opens the game picker', async () => {
    const { result, onOpenNewGame } = mount();
    act(() => result.current.onInput('/play', 5));
    await act(() => result.current.send());
    expect(onOpenNewGame).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('awaits the NIP-29 join before the first message on an open group', async () => {
    members = [];
    const { result } = mount();
    act(() => result.current.onInput('hello', 5));
    await act(() => result.current.send());
    expect(joinGroup).toHaveBeenCalledWith('g');
    expect(joinGroup.mock.invocationCallOrder[0]).toBeLessThan(sendMessage.mock.invocationCallOrder[0]);
    expect(sendMessage).toHaveBeenCalledWith('g', 'hello', null, []);
  });

  it('keeps the draft and shows the error when the join is rejected', async () => {
    members = [];
    joinGroup.mockRejectedValueOnce(new Error('user rejected'));
    const { result } = mount();
    act(() => result.current.onInput('hello', 5));
    await act(() => result.current.send());
    expect(sendMessage).not.toHaveBeenCalled();
    expect(result.current.sendError).toBe('user rejected');
    expect(result.current.draft).toBe('hello');
  });

  it('does not join when already a member, an admin, or when the relay has not granted access', async () => {
    const { result } = mount();
    act(() => result.current.onInput('hello', 5));
    await act(() => result.current.send());
    expect(joinGroup).not.toHaveBeenCalled();

    members = [];
    admins = [ME];
    const asAdmin = mount();
    act(() => asAdmin.result.current.onInput('hello', 5));
    await act(() => asAdmin.result.current.send());
    expect(joinGroup).not.toHaveBeenCalled();

    admins = [];
    // Not yet authenticated; 'pending' (the old value here) is not a state the bridge can emit.
    relayAccess = 'authenticating';
    const gated = mount();
    act(() => gated.result.current.onInput('hello', 5));
    await act(() => gated.result.current.send());
    expect(joinGroup).not.toHaveBeenCalled();
  });
});

describe('useChannelComposer: channel change', () => {
  it('drops the open @-picker and the last send error in the render that switches channel', async () => {
    const inputRef = createRef<HTMLInputElement>();
    const { result, rerender } = renderHook(
      ({ groupId }: { groupId: string }) => useChannelComposer({
        groupId, group: GROUP, messages: [MSG], replyingTo: null,
        setReplyingTo: vi.fn(), inputRef, onOpenNewGame: vi.fn(),
      }),
      { initialProps: { groupId: 'g' } },
    );
    await act(async () => { await Promise.resolve(); });
    uploadToBlossom.mockRejectedValueOnce(new Error('offline'));
    await act(() => result.current.onPickFiles([new File(['x'], 'a.png', { type: 'image/png' })]));
    expect(result.current.sendError).toBe('offline');
    act(() => result.current.onInput('@al', 3));
    expect(result.current.mentionQuery).toBe('al');

    rerender({ groupId: 'g2' });
    expect(result.current.mentionQuery).toBeNull();
    expect(result.current.sendError).toBeNull();
  });
});

describe('useChannelComposer: attachments', () => {
  it('appends uploaded URLs on their own lines, capped at four', async () => {
    uploadToBlossom.mockImplementation(async (f: File) => `https://blossom/${f.name}`);
    const { result } = mount();
    act(() => result.current.onInput('look', 4));
    const files = ['a', 'b', 'c', 'd', 'e'].map((n) => new File(['x'], `${n}.png`, { type: 'image/png' }));
    await act(() => result.current.onPickFiles(files));
    expect(uploadToBlossom).toHaveBeenCalledTimes(4);
    expect(result.current.draft).toBe('look\nhttps://blossom/a.png\nhttps://blossom/b.png\nhttps://blossom/c.png\nhttps://blossom/d.png');
    expect(result.current.pendingImageUrls).toHaveLength(4);
    act(() => result.current.removeAttachmentUrl('https://blossom/b.png'));
    expect(result.current.draft).not.toContain('b.png');
  });

  it('surfaces an upload failure in sendError instead of swallowing it', async () => {
    // The phone composer used to console.warn here, so the user tapped
    // attach and nothing happened.
    uploadToBlossom.mockRejectedValueOnce(new Error('blossom 413'));
    const { result } = mount();
    await act(() => result.current.onPickFiles([new File(['x'], 'a.png', { type: 'image/png' })]));
    expect(result.current.sendError).toBe('blossom 413');
    expect(result.current.uploading).toBe(false);
    expect(result.current.draft).toBe('');
  });

  it('a voice note replaces the draft and is tagged on send', async () => {
    uploadToBlossom.mockResolvedValueOnce('https://blossom/note.webm');
    const { result } = mount();
    await act(() => result.current.onVoiceRecorded(new File(['x'], 'n.webm', { type: 'audio/webm' }), 7));
    expect(result.current.draft).toBe('https://blossom/note.webm');
    expect(result.current.draftVoiceNote).toEqual({ url: 'https://blossom/note.webm', durationSeconds: 7 });
    await act(() => result.current.send());
    const tags = sendMessage.mock.calls[0][3] as string[][];
    expect(tags.some((t) => t[0] === 'voice' || t.includes('https://blossom/note.webm'))).toBe(true);
  });

  it('a voice upload failure is reported too', async () => {
    uploadToBlossom.mockRejectedValueOnce(new Error('offline'));
    const { result } = mount();
    await act(() => result.current.onVoiceRecorded(new File(['x'], 'n.webm', { type: 'audio/webm' }), 3));
    expect(result.current.sendError).toBe('offline');
    expect(result.current.draftVoiceNote).toBeNull();
  });
});

describe('useChannelComposer: pickers', () => {
  it('slash detection opens the command picker and Escape closes it', () => {
    const { result } = mount();
    act(() => result.current.onInput('/za', 3));
    expect(result.current.slashQuery).toBe('za');
    expect(result.current.slashResults.map((c) => c.name)).toContain('zap');
    act(() => result.current.onKeyDown({ key: 'Escape', preventDefault() {} } as never));
    expect(result.current.slashQuery).toBeNull();
  });

  it('a sticker replaces the draft and is dropped again on typing', () => {
    const { result } = mount();
    act(() => result.current.onPickMedia(':cat:', { name: 'cat', url: 'https://cdn/cat.webp' }, 'sticker'));
    expect(result.current.draft).toBe(':cat:');
    expect(result.current.pickerEmojis).toMatchObject({ cat: 'https://cdn/cat.webp', party: 'https://cdn/party.webp' });
    act(() => result.current.onInput(':cat: hi', 8));
    expect(result.current.draft).toBe(':cat: hi');
  });
});
