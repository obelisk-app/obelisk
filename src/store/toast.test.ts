import { describe, it, expect, beforeEach } from 'vitest';
import { useToastStore } from './toast';

describe('useToastStore', () => {
  beforeEach(() => {
    useToastStore.getState().clearToasts();
  });

  it('starts empty', () => {
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('pushToast appends a toast and returns its id', () => {
    const id = useToastStore.getState().pushToast({ title: 'Hi', body: 'there' });
    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].id).toBe(id);
    expect(toasts[0].title).toBe('Hi');
    expect(toasts[0].body).toBe('there');
  });

  it('dismissToast removes the matching toast', () => {
    const id = useToastStore.getState().pushToast({ title: 'a', body: 'b' });
    useToastStore.getState().pushToast({ title: 'c', body: 'd' });
    useToastStore.getState().dismissToast(id);
    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].title).toBe('c');
  });

  it('caps the stack at 4 toasts, dropping the oldest', () => {
    for (let i = 0; i < 6; i++) {
      useToastStore.getState().pushToast({ title: `t${i}`, body: '' });
    }
    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(4);
    expect(toasts.map((t) => t.title)).toEqual(['t2', 't3', 't4', 't5']);
  });

  it('clearToasts empties the stack', () => {
    useToastStore.getState().pushToast({ title: 'x', body: 'y' });
    useToastStore.getState().clearToasts();
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});
