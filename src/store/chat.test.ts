import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatStore } from './chat';

describe('useChatStore', () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState());
  });

  it('starts with correct initial state', () => {
    const state = useChatStore.getState();
    expect(state.servers).toEqual([]);
    expect(state.activeServerId).toBeNull();
    expect(state.pinnedChannels).toEqual([]);
    expect(state.categories).toEqual([]);
    expect(state.activeChannelId).toBeNull();
    expect(state.messages).toEqual([]);
    expect(state.isLoadingChannels).toBe(true);
    expect(state.isLoadingMessages).toBe(false);
    expect(state.replyingTo).toBeNull();
  });

  it('setServers updates server list', () => {
    const servers = [{ id: 's1', name: 'Test', icon: null, banner: null }];
    useChatStore.getState().setServers(servers);
    expect(useChatStore.getState().servers).toEqual(servers);
  });

  it('setActiveServer resets channel state', () => {
    useChatStore.getState().setChannels(
      [{ id: 'ch1', name: 'gen', emoji: null, type: 'text', position: 0, categoryId: null }],
      []
    );
    useChatStore.getState().setActiveServer('s2');
    const state = useChatStore.getState();
    expect(state.activeServerId).toBe('s2');
    expect(state.pinnedChannels).toEqual([]);
    expect(state.activeChannelId).toBeNull();
    expect(state.isLoadingChannels).toBe(true);
  });

  it('setActiveServer is a no-op when re-selecting the already-active server', () => {
    // Without this guard, clicking the same server icon twice re-arms
    // isLoadingChannels=true while the activeServerId-keyed effect doesn't
    // re-fire (no dep change), leaving the UI stuck on skeletons forever.
    useChatStore.getState().setActiveServer('s1');
    useChatStore.getState().setChannels(
      [{ id: 'ch1', name: 'gen', emoji: null, type: 'text', position: 0, categoryId: null }],
      []
    );
    useChatStore.getState().setActiveChannel('ch1');
    expect(useChatStore.getState().isLoadingChannels).toBe(false);

    useChatStore.getState().setActiveServer('s1');
    const state = useChatStore.getState();
    expect(state.activeServerId).toBe('s1');
    expect(state.isLoadingChannels).toBe(false);
    expect(state.pinnedChannels).toHaveLength(1);
    expect(state.activeChannelId).toBe('ch1');
  });

  it('setChannels updates pinned channels and categories', () => {
    const pinned = [{ id: 'ch1', name: 'general', emoji: '💬', type: 'text', position: 0, categoryId: null }];
    const categories = [{
      id: 'cat1', name: 'OFICIAL', position: 0,
      channels: [{ id: 'ch2', name: 'anuncios', emoji: '📢', type: 'text', position: 0, categoryId: 'cat1' }],
    }];
    useChatStore.getState().setChannels(pinned, categories);

    const state = useChatStore.getState();
    expect(state.pinnedChannels).toEqual(pinned);
    expect(state.categories).toEqual(categories);
    expect(state.isLoadingChannels).toBe(false);
  });

  it('setActiveChannel clears messages, reply, and sets loading', () => {
    useChatStore.getState().addMessage({
      id: 'm1', channelId: 'ch1', authorPubkey: 'pk1',
      content: 'hello', replyToId: null, editedAt: null, createdAt: new Date().toISOString(),
    });
    useChatStore.getState().setReplyingTo({
      id: 'm1', channelId: 'ch1', authorPubkey: 'pk1',
      content: 'hello', replyToId: null, editedAt: null, createdAt: new Date().toISOString(),
    });

    useChatStore.getState().setActiveChannel('ch2');
    const state = useChatStore.getState();
    expect(state.activeChannelId).toBe('ch2');
    expect(state.messages).toEqual([]);
    expect(state.replyingTo).toBeNull();
    expect(state.isLoadingMessages).toBe(true);
  });

  it('addMessage appends to messages', () => {
    const msg1 = { id: 'm1', channelId: 'ch1', authorPubkey: 'pk1', content: 'first', replyToId: null, editedAt: null, createdAt: '2024-01-01' };
    const msg2 = { id: 'm2', channelId: 'ch1', authorPubkey: 'pk2', content: 'second', replyToId: null, editedAt: null, createdAt: '2024-01-02' };

    useChatStore.getState().addMessage(msg1);
    useChatStore.getState().addMessage(msg2);
    expect(useChatStore.getState().messages).toEqual([msg1, msg2]);
  });

  it('removeMessage removes a message by id', () => {
    const msg1 = { id: 'm1', channelId: 'ch1', authorPubkey: 'pk1', content: 'first', replyToId: null, editedAt: null, createdAt: '2024-01-01' };
    const msg2 = { id: 'm2', channelId: 'ch1', authorPubkey: 'pk2', content: 'second', replyToId: null, editedAt: null, createdAt: '2024-01-02' };
    useChatStore.getState().addMessage(msg1);
    useChatStore.getState().addMessage(msg2);
    useChatStore.getState().removeMessage('m1');
    expect(useChatStore.getState().messages).toEqual([msg2]);
  });

  it('setReplyingTo sets and clears reply state', () => {
    const msg = { id: 'm1', channelId: 'ch1', authorPubkey: 'pk1', content: 'hello', replyToId: null, editedAt: null, createdAt: '2024-01-01' };
    useChatStore.getState().setReplyingTo(msg);
    expect(useChatStore.getState().replyingTo).toEqual(msg);

    useChatStore.getState().setReplyingTo(null);
    expect(useChatStore.getState().replyingTo).toBeNull();
  });

  it('starts with correct pagination initial state', () => {
    const state = useChatStore.getState();
    expect(state.messageCursor).toBeNull();
    expect(state.hasMoreMessages).toBe(false);
    expect(state.typingUsers).toEqual({});
  });

  it('setMessageCursor updates cursor and hasMore', () => {
    useChatStore.getState().setMessageCursor('cursor-123', true);
    const state = useChatStore.getState();
    expect(state.messageCursor).toBe('cursor-123');
    expect(state.hasMoreMessages).toBe(true);
  });

  it('prependMessages adds messages at the beginning', () => {
    const msg1 = { id: 'm1', channelId: 'ch1', authorPubkey: 'pk1', content: 'first', replyToId: null, editedAt: null, createdAt: '2024-01-01' };
    const msg2 = { id: 'm2', channelId: 'ch1', authorPubkey: 'pk2', content: 'second', replyToId: null, editedAt: null, createdAt: '2024-01-02' };
    const older = { id: 'm0', channelId: 'ch1', authorPubkey: 'pk1', content: 'older', replyToId: null, editedAt: null, createdAt: '2023-12-31' };

    useChatStore.getState().addMessage(msg1);
    useChatStore.getState().addMessage(msg2);
    useChatStore.getState().prependMessages([older]);

    const msgs = useChatStore.getState().messages;
    expect(msgs[0]).toEqual(older);
    expect(msgs).toHaveLength(3);
  });

  it('setActiveChannel resets pagination and typing', () => {
    useChatStore.getState().setMessageCursor('cursor-123', true);
    useChatStore.getState().setActiveChannel('ch2');
    const state = useChatStore.getState();
    expect(state.messageCursor).toBeNull();
    expect(state.hasMoreMessages).toBe(false);
    expect(state.typingUsers).toEqual({});
  });

  it('setTyping adds pubkey to typingUsers', () => {
    vi.useFakeTimers();
    useChatStore.getState().setTyping('pk-typer');
    expect(Object.keys(useChatStore.getState().typingUsers)).toContain('pk-typer');
    vi.useRealTimers();
  });

  it('clearTyping removes pubkey from typingUsers', () => {
    vi.useFakeTimers();
    useChatStore.getState().setTyping('pk-typer');
    useChatStore.getState().clearTyping('pk-typer');
    expect(Object.keys(useChatStore.getState().typingUsers)).not.toContain('pk-typer');
    vi.useRealTimers();
  });

  describe('presence', () => {
    it('starts with an empty onlinePubkeys Set', () => {
      const { onlinePubkeys } = useChatStore.getState();
      expect(onlinePubkeys).toBeInstanceOf(Set);
      expect(onlinePubkeys.size).toBe(0);
    });

    it('setOnlinePubkeys replaces the set with the given pubkeys', () => {
      useChatStore.getState().setOnlinePubkeys(['a', 'b', 'c']);
      const { onlinePubkeys } = useChatStore.getState();
      expect(onlinePubkeys.size).toBe(3);
      expect(onlinePubkeys.has('a')).toBe(true);
      expect(onlinePubkeys.has('b')).toBe(true);
      expect(onlinePubkeys.has('c')).toBe(true);
    });

    it('setOnlinePubkeys([]) clears the set', () => {
      useChatStore.getState().setOnlinePubkeys(['a']);
      useChatStore.getState().setOnlinePubkeys([]);
      expect(useChatStore.getState().onlinePubkeys.size).toBe(0);
    });

    it('setPresence adds a pubkey when online=true', () => {
      useChatStore.getState().setPresence('a', true);
      expect(useChatStore.getState().onlinePubkeys.has('a')).toBe(true);
    });

    it('setPresence removes a pubkey when online=false', () => {
      useChatStore.getState().setOnlinePubkeys(['a', 'b']);
      useChatStore.getState().setPresence('a', false);
      const { onlinePubkeys } = useChatStore.getState();
      expect(onlinePubkeys.has('a')).toBe(false);
      expect(onlinePubkeys.has('b')).toBe(true);
    });

    it('setPresence is idempotent when toggling the same state twice', () => {
      useChatStore.getState().setPresence('a', true);
      useChatStore.getState().setPresence('a', true);
      expect(useChatStore.getState().onlinePubkeys.size).toBe(1);
      useChatStore.getState().setPresence('a', false);
      useChatStore.getState().setPresence('a', false);
      expect(useChatStore.getState().onlinePubkeys.size).toBe(0);
    });

    it('setPresence returns a new Set reference so subscribers re-render', () => {
      const before = useChatStore.getState().onlinePubkeys;
      useChatStore.getState().setPresence('a', true);
      const after = useChatStore.getState().onlinePubkeys;
      expect(after).not.toBe(before);
    });
  });
});
