import { describe, expect, it } from 'vitest';
import { composerEnterAction, insertLineBreak } from '@/utils/chat/composer/enter-key';

const key = (over: Partial<Parameters<typeof composerEnterAction>[0]> = {}) => ({
  key: 'Enter', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...over,
});

describe('composerEnterAction', () => {
  it('plain Enter sends', () => {
    expect(composerEnterAction(key())).toBe('send');
  });

  it('Shift+Enter is left to the textarea', () => {
    expect(composerEnterAction(key({ shiftKey: true }))).toBe('native');
    expect(composerEnterAction(key({ shiftKey: true, ctrlKey: true }))).toBe('native');
  });

  it('Ctrl+Enter and Cmd+Enter insert a line break', () => {
    expect(composerEnterAction(key({ ctrlKey: true }))).toBe('newline');
    expect(composerEnterAction(key({ metaKey: true }))).toBe('newline');
  });

  it('ignores other keys, Alt+Enter and an IME confirming a candidate', () => {
    expect(composerEnterAction(key({ key: 'a' }))).toBeNull();
    expect(composerEnterAction(key({ altKey: true }))).toBeNull();
    expect(composerEnterAction(key({ isComposing: true }))).toBeNull();
  });
});

describe('insertLineBreak', () => {
  it('inserts at the caret', () => {
    expect(insertLineBreak('helloworld', 5, 5)).toEqual({ value: 'hello\nworld', caret: 6 });
  });

  it('replaces a selection', () => {
    expect(insertLineBreak('hello big world', 5, 10)).toEqual({ value: 'hello\nworld', caret: 6 });
  });
});
