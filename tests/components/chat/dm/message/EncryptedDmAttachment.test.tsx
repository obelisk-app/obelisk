import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EncryptedDmAttachment } from '@/components/chat/dm/message/EncryptedDmAttachment';
import { LocaleProvider } from '@tests/support/intl';
import { encryptFile } from '@nostr-wot/dm';
import type { JsDmFile } from '@/utils/attachments/dm-file';

const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);

async function makeFile(mimeType: string, name?: string): Promise<{ meta: JsDmFile; cipher: Uint8Array }> {
  const enc = await encryptFile(new TextEncoder().encode('pixels'));
  return {
    cipher: enc.ciphertext,
    meta: { url: 'https://blossom.example/b', mimeType, algorithm: 'aes-gcm', key: enc.key, nonce: enc.nonce, x: enc.x, size: 6, name },
  };
}

describe('EncryptedDmAttachment', () => {
  const created: string[] = [];
  const revoked: string[] = [];
  beforeEach(() => {
    created.length = 0;
    revoked.length = 0;
    let n = 0;
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn(() => { const u = `blob:test/${++n}`; created.push(u); return u; }),
      revokeObjectURL: vi.fn((u: string) => { revoked.push(u); }),
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows a skeleton, then the decrypted image, and revokes the blob on unmount', async () => {
    const { meta, cipher } = await makeFile('image/png', 'cat.png');
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    vi.stubGlobal('fetch', vi.fn(async () => { await gate; return { ok: true, arrayBuffer: async () => cipher.slice().buffer }; }));
    const { unmount } = renderLocalized(<EncryptedDmAttachment file={meta} />);
    expect(screen.getByTestId('dm-file-loading')).toBeInTheDocument();
    release();
    const img = await screen.findByAltText('cat.png');
    expect(img).toHaveAttribute('src', created[0]);
    unmount();
    expect(revoked).toContain(created[0]);
  });

  it('shows an integrity error when the blob was swapped', async () => {
    const { meta, cipher } = await makeFile('image/png');
    const bad = cipher.slice();
    bad[0] ^= 1;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => bad.buffer })));
    renderLocalized(<EncryptedDmAttachment file={meta} />);
    expect(await screen.findByTestId('dm-file-error')).toHaveTextContent("doesn't match");
    expect(created).toHaveLength(0);
  });

  it('does not fetch a generic file until asked', async () => {
    const { meta, cipher } = await makeFile('application/pdf', 'doc.pdf');
    const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => cipher.slice().buffer }));
    vi.stubGlobal('fetch', fetchMock);
    renderLocalized(<EncryptedDmAttachment file={meta} />);
    expect(screen.getByText('doc.pdf')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('dm-file-decrypt'));
    await waitFor(() => expect(screen.getByTestId('dm-file-save')).toHaveAttribute('href', created[0]));
    expect(screen.getByTestId('dm-file-save')).toHaveAttribute('download', 'doc.pdf');
  });
});
