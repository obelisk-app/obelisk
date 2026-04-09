import { describe, it, expect, beforeEach } from 'vitest';
import { useDMStore } from './dm';

describe('useDMStore', () => {
  beforeEach(() => {
    useDMStore.setState(useDMStore.getInitialState());
  });

  it('has correct initial state', () => {
    const state = useDMStore.getState();
    expect(state.isDMMode).toBe(false);
    expect(state.activeDMPubkey).toBeNull();
    expect(state.threads).toEqual([]);
    expect(state.messages).toEqual([]);
  });

  it('toggles DM mode', () => {
    useDMStore.getState().setDMMode(true);
    expect(useDMStore.getState().isDMMode).toBe(true);
    useDMStore.getState().setDMMode(false);
    expect(useDMStore.getState().isDMMode).toBe(false);
  });

  it('sets active DM and clears messages', () => {
    useDMStore.setState({ messages: [{ id: '1', senderPubkey: 'a', recipientPubkey: 'b', content: 'hi', createdAt: 0 }] });
    useDMStore.getState().setActiveDM('pk1');
    expect(useDMStore.getState().activeDMPubkey).toBe('pk1');
    expect(useDMStore.getState().messages).toEqual([]);
    expect(useDMStore.getState().isLoadingMessages).toBe(true);
  });

  it('adds and updates threads', () => {
    useDMStore.getState().addThread({ pubkey: 'pk1', displayName: 'Alice', unreadCount: 0 });
    useDMStore.getState().addThread({ pubkey: 'pk2', displayName: 'Bob', unreadCount: 1 });
    expect(useDMStore.getState().threads).toHaveLength(2);

    useDMStore.getState().updateThread('pk1', { lastMessage: 'Hello' });
    expect(useDMStore.getState().threads.find(t => t.pubkey === 'pk1')?.lastMessage).toBe('Hello');
  });

  it('deduplicates threads on addThread', () => {
    useDMStore.getState().addThread({ pubkey: 'pk1', displayName: 'Alice', unreadCount: 0 });
    useDMStore.getState().addThread({ pubkey: 'pk1', displayName: 'Alice Updated', unreadCount: 2 });
    expect(useDMStore.getState().threads).toHaveLength(1);
    expect(useDMStore.getState().threads[0].displayName).toBe('Alice Updated');
  });

  it('adds messages', () => {
    useDMStore.getState().addMessage({ id: '1', senderPubkey: 'a', recipientPubkey: 'b', content: 'hi', createdAt: 100 });
    useDMStore.getState().addMessage({ id: '2', senderPubkey: 'b', recipientPubkey: 'a', content: 'hello', createdAt: 101 });
    expect(useDMStore.getState().messages).toHaveLength(2);
  });
});
