import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { BridgeProvider } from '@/services/nostr-bridge';
import { LocaleProvider } from '@tests/support/intl';

const editUserMetadata = vi.fn();
let signerReady = true;
let generation = 0;
let emitGeneration: (value: number) => void = () => {};
let bridge: ReturnType<typeof fakeBridge>;
const uploadToBlossom = vi.fn();
vi.mock('@/services/media/blossom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/media/blossom')>()),
  uploadToBlossom: (...a: unknown[]) => uploadToBlossom(...a),
}));

import { useProfileEditorForm } from '@/hooks/session/useProfileEditorForm';
import { BlossomUploadError } from '@/services/media/blossom';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  bridge ??= fakeBridge({ myPubkey: signerReady ? 'a'.repeat(64) : null, isLoggedIn: signerReady, myLoginMethod: signerReady ? 'nsec' : null }, { editUserMetadata, getSessionGeneration: () => generation, subscribeSessionGeneration: (cb) => { emitGeneration = cb; cb(generation); return () => {}; }, getPublicKey: () => bridge.stores.myPubkey.get() });
  return <LocaleProvider initialLocale="en"><BridgeProvider bridge={bridge}>{children}</BridgeProvider></LocaleProvider>;
};
const INITIAL = { displayName: 'Alice', name: 'alice', about: 'hi', picture: 'https://cdn/a.png', banner: '', nip05: 'alice@x', lud16: '', website: '' };
const file = (name: string) => new File(['x'], name, { type: 'image/png' });

beforeEach(() => {
  signerReady = true;
  generation = 0;
  bridge = undefined as unknown as ReturnType<typeof fakeBridge>;
  editUserMetadata.mockResolvedValue(undefined);
  uploadToBlossom.mockResolvedValue('https://blossom/uploaded.png');
});
afterEach(() => vi.clearAllMocks());

describe('useProfileEditorForm', () => {
  it('discards dirty text and picked files when the active account changes', () => {
    const { result, rerender } = renderHook(({ initial }) => useProfileEditorForm(initial, () => {}), {
      wrapper, initialProps: { initial: INITIAL },
    });
    act(() => result.current.setValues({ name: 'Unsaved Alice', pictureFile: file('alice.png') }));
    act(() => bridge.stores.myPubkey.set('b'.repeat(64)));
    rerender({ initial: { ...INITIAL, displayName: 'Bob', picture: '' } });
    expect(result.current.values.name).toBe('Bob');
    expect(result.current.values.pictureFile).toBeNull();
    expect(result.current.dirty).toBe(false);
  });

  it('drops dirty drafts and files when the same account gets a new session', () => {
    const { result } = renderHook(() => useProfileEditorForm(INITIAL, () => {}), { wrapper });
    act(() => result.current.setValues({ name: 'Unsaved Alice', pictureFile: file('alice.png') }));
    act(() => { generation += 1; emitGeneration(generation); });
    expect(result.current.values.name).toBe('Alice');
    expect(result.current.values.pictureFile).toBeNull();
    expect(result.current.dirty).toBe(false);
  });

  it.each(['account', 'session'] as const)('ignores an old save after the %s changes', async (change) => {
    let finish!: () => void;
    editUserMetadata.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const onSaved = vi.fn();
    const { result } = renderHook(() => useProfileEditorForm(INITIAL, onSaved), { wrapper });
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.submit(); });
    await vi.waitFor(() => expect(editUserMetadata).toHaveBeenCalled());
    act(() => {
      if (change === 'account') bridge.stores.myPubkey.set('b'.repeat(64));
      else { generation += 1; emitGeneration(generation); }
    });
    await act(async () => { finish(); await pending; });
    expect(onSaved).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });


  it('hydrates from metadata that arrives late, but never over the user\'s typing', () => {
    const { result, rerender } = renderHook(({ initial }) => useProfileEditorForm(initial, () => {}), {
      wrapper,
      initialProps: { initial: null as typeof INITIAL | null },
    });
    expect(result.current.values.name).toBe('');
    rerender({ initial: INITIAL });
    expect(result.current.values.name).toBe('Alice');
    expect(result.current.values.nip05).toBe('alice@x');
    act(() => result.current.set('name', 'Alicia'));
    rerender({ initial: { ...INITIAL, displayName: 'Relay says Alice' } });
    expect(result.current.values.name).toBe('Alicia');
  });

  it('refuses to save an empty name with the dictionary message', async () => {
    const { result } = renderHook(() => useProfileEditorForm({ ...INITIAL, displayName: '', name: '' }, () => {}), { wrapper });
    expect(result.current.nameValid).toBe(false);
    await act(() => result.current.submit());
    expect(result.current.error).toBe('Name is required');
    expect(editUserMetadata).not.toHaveBeenCalled();
  });

  it('checks the signer BEFORE uploading, so a picked image is not burned on Blossom', async () => {
    // The phone screen used to upload the picture and banner first and only
    // then notice the signer was not ready.
    signerReady = false;
    const onSaved = vi.fn();
    const { result } = renderHook(() => useProfileEditorForm(INITIAL, onSaved), { wrapper });
    act(() => result.current.set('pictureFile', file('a.png')));
    await act(() => result.current.submit());
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
      result.current.setValues({ name: '  Alice B  ', pictureFile: file('p.png'), bannerFile: file('b.png'), website: ' https://alice.example ' });
    });
    await act(() => result.current.submit());
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
    }, expect.objectContaining({ assertCurrent: expect.any(Function) }));
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(false);
    expect(result.current.uploading).toBeNull();
  });

  it('keeps a typed URL when no file was picked, and shows a publish failure', async () => {
    editUserMetadata.mockRejectedValueOnce(new Error('relay refused'));
    const { result } = renderHook(() => useProfileEditorForm(INITIAL, () => {}), { wrapper });
    act(() => result.current.set('picture', 'https://cdn/new.png'));
    await act(() => result.current.submit());
    expect(uploadToBlossom).not.toHaveBeenCalled();
    expect(editUserMetadata).toHaveBeenCalledWith(expect.objectContaining({ picture: 'https://cdn/new.png' }), expect.objectContaining({ assertCurrent: expect.any(Function) }));
    expect(result.current.error).toBe('Failed to publish');
    expect(result.current.submitting).toBe(false);
  });

  it('names a failed upload as an upload, not a publish', async () => {
    uploadToBlossom.mockRejectedValueOnce(new BlossomUploadError(['blossom.example: HTTP 413']));
    const { result } = renderHook(() => useProfileEditorForm(INITIAL, () => {}), { wrapper });
    act(() => result.current.set('pictureFile', file('a.png')));
    await act(() => result.current.submit());
    expect(result.current.error).toBe('Upload failed.');
    expect(editUserMetadata).not.toHaveBeenCalled();
  });
});
