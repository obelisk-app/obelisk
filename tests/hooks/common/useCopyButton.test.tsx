import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCopyButton } from '@/hooks/common/useCopyButton';

describe('useCopyButton', () => {
  const writeText = vi.fn<(text: string) => Promise<void>>();

  beforeEach(() => {
    writeText.mockReset();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('copies the text, shows the tick and calls onCopied', async () => {
    writeText.mockResolvedValue(undefined);
    const onCopied = vi.fn();
    const { result } = renderHook(() => useCopyButton('npub1abc', onCopied));
    expect(result.current.done).toBe(false);
    await act(async () => { result.current.copy(); });
    expect(writeText).toHaveBeenCalledWith('npub1abc');
    expect(result.current.done).toBe(true);
    expect(onCopied).toHaveBeenCalledTimes(1);
  });

  it('a refused clipboard neither shows the tick nor calls onCopied', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    const onCopied = vi.fn();
    const { result } = renderHook(() => useCopyButton('npub1abc', onCopied));
    await act(async () => { result.current.copy(); });
    expect(result.current.done).toBe(false);
    expect(onCopied).not.toHaveBeenCalled();
  });
});
