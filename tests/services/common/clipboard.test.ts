import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText, copyWithToast } from '@/services/common/clipboard';
import { useToastStore } from '@/store/feedback/toast';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('copyWithToast', () => {
  it('writes to the clipboard and pushes a toast', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const pushToast = vi.spyOn(useToastStore.getState(), 'pushToast');
    copyWithToast('npub1x', 'Copied', 'Alice');
    expect(writeText).toHaveBeenCalledWith('npub1x');
    expect(pushToast).toHaveBeenCalledWith({ title: 'Copied', body: 'Alice' });
  });

  it('still confirms when the clipboard is missing or its shim returns nothing', () => {
    const pushToast = vi.spyOn(useToastStore.getState(), 'pushToast');
    pushToast.mockClear();
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    expect(() => copyWithToast('x', 'Copied')).not.toThrow();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: () => undefined } });
    expect(() => copyWithToast('y', 'Copied')).not.toThrow();
    expect(pushToast).toHaveBeenCalledTimes(2);
    expect(pushToast).toHaveBeenLastCalledWith({ title: 'Copied', body: '' });
  });
});

describe('copyText', () => {
  it('uses the clipboard API when it works', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await expect(copyText('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to a hidden textarea when the clipboard API refuses, and cleans it up', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;
    await expect(copyText('nostrconnect://x')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
    execCommand.mockReturnValue(false);
    await expect(copyText('nostrconnect://x')).resolves.toBe(false);
  });
});
