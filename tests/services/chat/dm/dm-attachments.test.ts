import { afterEach, describe, expect, it, vi } from 'vitest';

const uploadEncryptedBlob = vi.hoisted(() => vi.fn());
vi.mock('@/services/media/blossom', () => ({ uploadEncryptedBlob }));

import { baseMime, checkDmAttachment, DmAttachmentRejectedError, encryptAndUploadDmFile } from '@/services/chat/dm/dm-attachments';
import { decryptFile } from '@/lib/crypto/file-cipher';

describe('dm-attachments', () => {
  afterEach(() => uploadEncryptedBlob.mockReset());

  it('accepts recorder mime types with codec parameters', () => {
    expect(baseMime('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(checkDmAttachment(new File(['x'], 'v.weba', { type: 'audio/webm;codecs=opus' }))).toBeNull();
    expect(checkDmAttachment(new File(['x'], 'a.exe', { type: 'application/x-msdownload' }))).toBe('type');
  });

  it('uploads only ciphertext and returns metadata that decrypts it', async () => {
    let uploaded: Uint8Array | null = null;
    uploadEncryptedBlob.mockImplementation(async (bytes: Uint8Array) => { uploaded = bytes; return 'https://blossom.example/c'; });
    const file = new File(['hello secret'], 'note.txt', { type: 'text/plain' });
    const meta = await encryptAndUploadDmFile(file, { durationSeconds: 3 });
    expect(meta).toMatchObject({ url: 'https://blossom.example/c', mimeType: 'text/plain', name: 'note.txt', size: 12, durationSeconds: 3 });
    expect(new TextDecoder().decode(uploaded!)).not.toContain('secret');
    const plain = await decryptFile(uploaded!, meta.key, meta.nonce, meta.x);
    expect(new TextDecoder().decode(plain)).toBe('hello secret');
  });

  it('refuses before uploading when the file is not allowed', async () => {
    const refused = encryptAndUploadDmFile(new File(['x'], 'a.exe', { type: 'application/x-msdownload' }));
    await expect(refused).rejects.toBeInstanceOf(DmAttachmentRejectedError);
    await expect(refused).rejects.toMatchObject({ problem: 'type' });
    expect(uploadEncryptedBlob).not.toHaveBeenCalled();
  });
});
