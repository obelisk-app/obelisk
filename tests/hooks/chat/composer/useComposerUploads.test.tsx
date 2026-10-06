import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LocaleProvider } from '@tests/support/intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const uploadToBlossom = vi.fn<(f: File) => Promise<string>>();
vi.mock('@/services/blossom', () => ({ uploadToBlossom: (f: File) => uploadToBlossom(f) }));

import { useComposerUploads } from '@/hooks/chat/composer/useComposerUploads';

/** The hook words its errors through next-intl, so it needs a provider. */
const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;

function setup(initial = '') {
  let draft = initial;
  const targets = {
    setDraft: vi.fn((v: string | ((d: string) => string)) => { draft = typeof v === 'function' ? v(draft) : v; }),
    setDraftSticker: vi.fn(),
    setDraftVoiceNote: vi.fn(),
    setSendError: vi.fn(),
  };
  const hook = renderHook(() => useComposerUploads(targets), { wrapper });
  return { hook, targets, draft: () => draft };
}

describe('useComposerUploads', () => {
  // Block body: a function returned from beforeEach runs as its teardown.
  beforeEach(() => { uploadToBlossom.mockReset(); });

  it('uploads at most four files and appends their URLs to the draft', async () => {
    uploadToBlossom.mockImplementation(async (f) => `https://b/${f.name}`);
    const { hook, draft, targets } = setup('look');
    const files = ['1', '2', '3', '4', '5'].map((n) => new File(['x'], n, { type: 'image/png' }));
    await act(async () => { await hook.result.current.onPickFiles(files); });
    expect(uploadToBlossom).toHaveBeenCalledTimes(4);
    expect(draft()).toBe('look\nhttps://b/1\nhttps://b/2\nhttps://b/3\nhttps://b/4');
    expect(targets.setDraftSticker).toHaveBeenCalledWith(null);
    expect(hook.result.current.uploading).toBe(false);
  });

  it('a failed upload lands in sendError', async () => {
    uploadToBlossom.mockRejectedValue(new Error('blossom down'));
    const { hook, targets } = setup();
    await act(async () => { await hook.result.current.onPickFiles([new File(['x'], 'a')]); });
    expect(targets.setSendError).toHaveBeenLastCalledWith('Upload failed');
  });

  it('a voice note becomes the whole draft and is remembered with its duration', async () => {
    uploadToBlossom.mockResolvedValue('https://b/v.webm');
    const { hook, draft, targets } = setup('old');
    await act(async () => { await hook.result.current.onVoiceRecorded(new File(['x'], 'v.webm'), 4); });
    expect(draft()).toBe('https://b/v.webm');
    expect(targets.setDraftVoiceNote).toHaveBeenCalledWith({ url: 'https://b/v.webm', durationSeconds: 4 });
  });

  it('an empty pick does nothing', async () => {
    const { hook } = setup();
    await act(async () => { await hook.result.current.onPickFiles([]); });
    expect(uploadToBlossom).not.toHaveBeenCalled();
  });
});
