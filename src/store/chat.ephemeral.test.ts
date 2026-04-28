import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from './chat';

describe('chat store — ephemeralMessages', () => {
  beforeEach(() => useChatStore.getState().reset());

  it('pushes a message scoped to a channel', () => {
    useChatStore.getState().pushEphemeral('c1', 'Balance: 100 sats');
    const msgs = useChatStore.getState().ephemeralMessages.c1;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toBe('Balance: 100 sats');
  });

  it('does not leak across channels', () => {
    useChatStore.getState().pushEphemeral('c1', 'one');
    useChatStore.getState().pushEphemeral('c2', 'two');
    expect(useChatStore.getState().ephemeralMessages.c1).toHaveLength(1);
    expect(useChatStore.getState().ephemeralMessages.c2).toHaveLength(1);
  });

  it('clears a channel bucket', () => {
    useChatStore.getState().pushEphemeral('c1', 'x');
    useChatStore.getState().clearEphemeral('c1');
    expect(useChatStore.getState().ephemeralMessages.c1).toBeUndefined();
  });

  it('dismisses a single ephemeral by id', () => {
    useChatStore.getState().pushEphemeral('c1', 'first');
    useChatStore.getState().pushEphemeral('c1', 'second');
    const msgs = useChatStore.getState().ephemeralMessages.c1;
    expect(msgs).toHaveLength(2);
    useChatStore.getState().dismissEphemeral('c1', msgs[0].id);
    const after = useChatStore.getState().ephemeralMessages.c1;
    expect(after).toHaveLength(1);
    expect(after[0].text).toBe('second');
  });

  it('dismissing the last ephemeral cleans up the channel key', () => {
    useChatStore.getState().pushEphemeral('c1', 'only');
    const id = useChatStore.getState().ephemeralMessages.c1[0].id;
    useChatStore.getState().dismissEphemeral('c1', id);
    expect(useChatStore.getState().ephemeralMessages.c1).toBeUndefined();
  });

  it('reset wipes ephemeral messages', () => {
    useChatStore.getState().pushEphemeral('c1', 'x');
    useChatStore.getState().reset();
    expect(useChatStore.getState().ephemeralMessages).toEqual({});
  });
});
