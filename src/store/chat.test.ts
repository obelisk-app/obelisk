import { beforeEach, describe, expect, it } from 'vitest';
import { useChatStore } from './chat';

describe('useChatStore', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('starts with only the shared UI state', () => {
    expect(useChatStore.getState()).toMatchObject({
      activeChannelId: null,
      isNearBottom: true,
      serverEmojis: {},
      serverMediaKinds: {},
      profilePopupPubkey: null,
      profilePopupAnchor: null,
      lastActivityAt: {},
      presenceTick: 0,
    });
  });

  it('updates emoji and profile-popup state', () => {
    useChatStore.getState().setServerEmojis(
      { party: 'https://example.com/party.png' },
      { party: 'sticker' },
    );
    useChatStore.getState().openProfilePopup('alice', { x: 10, y: 20 });
    expect(useChatStore.getState().serverEmojis).toEqual({ party: 'https://example.com/party.png' });
    expect(useChatStore.getState().serverMediaKinds).toEqual({ party: 'sticker' });
    expect(useChatStore.getState().profilePopupPubkey).toBe('alice');
    expect(useChatStore.getState().profilePopupAnchor).toEqual({ x: 10, y: 20 });
    useChatStore.getState().closeProfilePopup();
    expect(useChatStore.getState().profilePopupPubkey).toBeNull();
    expect(useChatStore.getState().profilePopupAnchor).toBeNull();
  });

  it('keeps the newest activity timestamp and advances the presence clock', () => {
    useChatStore.getState().recordActivity('alice', 20);
    useChatStore.getState().recordActivity('alice', 10);
    useChatStore.getState().bumpPresenceTick();
    expect(useChatStore.getState().lastActivityAt.alice).toBe(20);
    expect(useChatStore.getState().presenceTick).toBeGreaterThan(0);
  });

  it('resets account-scoped UI state', () => {
    useChatStore.setState({
      activeChannelId: 'group',
      isNearBottom: false,
      serverEmojis: { party: 'url' },
      serverMediaKinds: { party: 'gif' },
      profilePopupPubkey: 'alice',
      profilePopupAnchor: { x: 10, y: 20 },
      lastActivityAt: { alice: 20 },
      presenceTick: 2,
    });
    useChatStore.getState().reset();
    expect(useChatStore.getState()).toMatchObject({
      activeChannelId: null,
      isNearBottom: true,
      serverEmojis: {},
      serverMediaKinds: {},
      profilePopupPubkey: null,
      profilePopupAnchor: null,
      lastActivityAt: {},
      presenceTick: 0,
    });
  });
});

describe('pendingJump (search → shell navigation handoff)', () => {
  beforeEach(() => useChatStore.getState().reset());

  it('defaults messageId to null so "just open this channel" is expressible', () => {
    useChatStore.getState().requestJump('g1');
    expect(useChatStore.getState().pendingJump).toEqual({ groupId: 'g1', messageId: null });
  });

  it('carries a message id when one is given', () => {
    useChatStore.getState().requestJump('g1', 'm1');
    expect(useChatStore.getState().pendingJump).toEqual({ groupId: 'g1', messageId: 'm1' });
  });

  it('consumeJump clears it so the shell does not re-navigate', () => {
    useChatStore.getState().requestJump('g1', 'm1');
    useChatStore.getState().consumeJump();
    expect(useChatStore.getState().pendingJump).toBeNull();
  });

  it('reset clears it', () => {
    useChatStore.getState().requestJump('g1', 'm1');
    useChatStore.getState().reset();
    expect(useChatStore.getState().pendingJump).toBeNull();
  });
});
