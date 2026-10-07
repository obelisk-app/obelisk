import { beforeEach, describe, expect, it } from 'vitest';
import { markDmThreadOpen } from '@/services/shell/panes/dm/active-dm-thread';
import { useDMStore } from '@/store/chat/dm';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

beforeEach(() => useDMStore.setState({ activeDMPubkey: null }));

describe('markDmThreadOpen', () => {
  it('marks the thread, and the undo clears it', () => {
    const undo = markDmThreadOpen(A);
    expect(useDMStore.getState().activeDMPubkey).toBe(A);
    undo();
    expect(useDMStore.getState().activeDMPubkey).toBeNull();
  });

  it('the undo leaves a thread opened since alone', () => {
    const undoA = markDmThreadOpen(A);
    markDmThreadOpen(B);
    undoA();
    expect(useDMStore.getState().activeDMPubkey).toBe(B);
  });

  it('no thread open marks nothing', () => {
    useDMStore.setState({ activeDMPubkey: A });
    markDmThreadOpen(null)();
    expect(useDMStore.getState().activeDMPubkey).toBeNull();
  });
});
