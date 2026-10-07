import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCreateMediaControl } from '@/hooks/chat/picker/useCreateMediaControl';
import { useEmojiPicker } from '@/hooks/chat/picker/useEmojiPicker';

describe('useCreateMediaControl', () => {
  it('hands the first file over with the kind and resets the input', () => {
    const onFile = vi.fn();
    const { result } = renderHook(() => useCreateMediaControl('gif', onFile));
    const file = new File(['x'], 'a.gif');
    const target = { files: [file], value: 'a.gif' };
    result.current.onChange({ target } as unknown as React.ChangeEvent<HTMLInputElement>);
    expect(onFile).toHaveBeenCalledWith(file, 'gif');
    expect(target.value).toBe('');
  });
});

describe('useEmojiPicker handlePickRecent', () => {
  beforeEach(() => localStorage.clear());

  it('sends a custom recent back as custom media and a Unicode one as its character', () => {
    const onPick = vi.fn();
    const { result } = renderHook(() => useEmojiPicker({ customEmojis: {}, skipRecent: true, onPick }));
    act(() => result.current.handlePickRecent({ char: '😀', custom: null }));
    expect(onPick).toHaveBeenLastCalledWith('😀');
    const custom = { name: 'party', url: 'https://x/p.png' };
    act(() => result.current.handlePickRecent({ char: ':party:', custom }));
    expect(onPick).toHaveBeenLastCalledWith(':party:', expect.objectContaining({ name: 'party', url: 'https://x/p.png' }));
  });
});
