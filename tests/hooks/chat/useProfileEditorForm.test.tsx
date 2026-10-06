import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { LocaleProvider } from '@tests/support/intl';

const editUserMetadata = vi.fn();
let signerReady = true;
vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    nostrActions: { editUserMetadata: (...a: unknown[]) => editUserMetadata(...a) },
    useSignerReady: () => signerReady,
  });
});
const uploadToBlossom = vi.fn();
vi.mock('@/services/blossom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/blossom')>()),
  uploadToBlossom: (...a: unknown[]) => uploadToBlossom(...a),
}));

import { useProfileEditorForm } from '@/hooks/chat/useProfileEditorForm';
import { BlossomUploadError } from '@/services/blossom';

const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;
const INITIAL = { displayName: 'Alice', name: 'alice', about: 'hi', picture: 'https://cdn/a.png', banner: '', nip05: 'alice@x', lud16: '', website: '' };
const file = (name: string) => new File(['x'], name, { type: 'image/png' });

beforeEach(() => {
  signerReady = true;
  editUserMetadata.mockResolvedValue(undefined);
  uploadToBlossom.mockResolvedValue('https://blossom/uploaded.png');
});
afterEach(() => vi.clearAllMocks());

describe('useProfileEditorForm', () => {
  it('hydrates from metadata that arrives late, but never over the user\'s typing', () => {
    const { result, rerender } = renderHook(({ initial }) => useProfileEditorForm(initial, () => {}), {
      wrapper,
      initialProps: { initial: null as typeof INITIAL | null },
    });
    expect(result.current.name).toBe('');
    rerender({ initial: INITIAL });
    expect(result.current.name).toBe('Alice');
    expect(result.current.nip05).toBe('alice@x');
    act(() => result.current.setName('Alicia'));
    rerender({ initial: { ...INITIAL, displayName: 'Relay says Alice' } });
    expect(result.current.name).toBe('Alicia');
  });

  it('refuses to save an empty name with the dictionary message', async () => {
    const { result } = renderHook(() => useProfileEditorForm({ ...INITIAL, displayName: '', name: '' }, () => {}), { wrapper });
    expect(result.current.nameValid).toBe(false);
    await act(() => result.current.save());
    expect(result.current.error).toBe('Name is required');
    expect(editUserMetadata).not.toHaveBeenCalled();
  });

  it('checks the signer BEFORE uploading, so a picked image is not burned on Blossom', async () => {
    // The phone screen used to upload the picture and banner first and only
    // then notice the signer was not ready.
    signerReady = false;
    const onSaved = vi.fn();
    const { result } = renderHook(() => useProfileEditorForm(INITIAL, onSaved), { wrapper });
    act(() => result.current.setPictureFile(file('a.png')));
    await act(() => result.current.save());
    expect(uploadToBlossom).not.toHaveBeenCalled();
    expect(editUserMetadata).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Not signed in');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('uploads picked files, publishes trimmed fields and reports', async () => {
    uploadToBlossom.mockResolvedValueOnce('https://blossom/pic.png').mockResolvedValueOnce('https://blossom/banner.png');
    const onSaved = vi.fn();
    const { result } = renderHook(() => useProfileEditorForm(INITIAL, onSaved), { wrapper });
    act(() => {
      result.current.setName('  Alice B  ');
      result.current.setPictureFile(file('p.png'));
      result.current.setBannerFile(file('b.png'));
      result.current.setWebsite(' https://alice.example ');
    });
    await act(() => result.current.save());
    expect(uploadToBlossom).toHaveBeenCalledTimes(2);
    expect(editUserMetadata).toHaveBeenCalledWith({
      name: 'Alice B',
      displayName: 'Alice B',
      about: 'hi',
      picture: 'https://blossom/pic.png',
      banner: 'https://blossom/banner.png',
      nip05: 'alice@x',
      lud16: '',
      website: 'https://alice.example',
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(false);
    expect(result.current.uploading).toBeNull();
  });

  it('keeps a typed URL when no file was picked, and shows a publish failure', async () => {
    editUserMetadata.mockRejectedValueOnce(new Error('relay refused'));
    const { result } = renderHook(() => useProfileEditorForm(INITIAL, () => {}), { wrapper });
    act(() => result.current.setPicture('https://cdn/new.png'));
    await act(() => result.current.save());
    expect(uploadToBlossom).not.toHaveBeenCalled();
    expect(editUserMetadata).toHaveBeenCalledWith(expect.objectContaining({ picture: 'https://cdn/new.png' }));
    expect(result.current.error).toBe('Failed to publish');
    expect(result.current.saving).toBe(false);
  });

  it('names a failed upload as an upload, not a publish', async () => {
    uploadToBlossom.mockRejectedValueOnce(new BlossomUploadError(['blossom.example: HTTP 413']));
    const { result } = renderHook(() => useProfileEditorForm(INITIAL, () => {}), { wrapper });
    act(() => result.current.setPictureFile(file('a.png')));
    await act(() => result.current.save());
    expect(result.current.error).toBe('Upload failed.');
    expect(editUserMetadata).not.toHaveBeenCalled();
  });
});
