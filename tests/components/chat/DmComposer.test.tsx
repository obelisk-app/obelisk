import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({
  sendDirectMessage: vi.fn(async () => {}),
  sendDirectFile: vi.fn(async () => {}),
}));
vi.mock('@/services/nostr-bridge', async (orig) => {
  const { bridgeOverrides } = await import('@tests/support/mocks/nostr-bridge');
  return { ...(await orig<typeof import('@/services/nostr-bridge')>()), ...bridgeOverrides({ nostrActions: actions }) };
});
const encryptAndUploadDmFile = vi.hoisted(() => vi.fn());
vi.mock('@/services/dm-attachments', async (orig) => ({
  ...(await orig<typeof import('@/services/dm-attachments')>()),
  encryptAndUploadDmFile,
}));

import { DmComposer } from '@/components/chat/DmComposer';
import { LocaleProvider, translator } from '@tests/support/intl';
import { CodedError } from '@/utils/errors/codes';
import { useDMStore } from '@/store/dm';

const PEER = 'b'.repeat(64);
const renderLocalized = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);
const meta = (name: string) => ({
  url: `https://blossom.example/${name}`, mimeType: 'image/png', algorithm: 'aes-gcm', key: 'aa', nonce: 'bb', x: 'cc', name,
});

describe('DmComposer', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }));
    useDMStore.setState({ protocolOverrides: {} });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    actions.sendDirectMessage.mockClear();
    actions.sendDirectFile.mockClear();
    encryptAndUploadDmFile.mockReset();
  });

  it('sends text through sendDirectMessage', () => {
    renderLocalized(<DmComposer peer={PEER} variant="desktop" />);
    fireEvent.change(screen.getByTestId('dm-composer-input'), { target: { value: 'hello' } });
    fireEvent.submit(screen.getByTestId('dm-composer'));
    expect(actions.sendDirectMessage).toHaveBeenCalledWith(PEER, 'hello', []);
    expect(screen.getByTestId('dm-composer-input')).toHaveValue('');
  });

  it('encrypts an attached file, holds it beside the draft, and sends it as a file message', async () => {
    let finish!: (v: unknown) => void;
    encryptAndUploadDmFile.mockImplementation(() => new Promise((r) => { finish = r; }));
    const { container } = renderLocalized(<DmComposer peer={PEER} variant="desktop" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['px'], 'cat.png', { type: 'image/png' })] } });
    expect(screen.getByTestId('dm-pending-file')).toBeInTheDocument();
    // Still uploading: nothing can be sent yet, and the URL never lands in the draft.
    expect(screen.getByTestId('dm-send')).toBeDisabled();
    expect(screen.getByTestId('dm-composer-input')).toHaveValue('');
    await act(async () => { finish(meta('cat.png')); });
    await waitFor(() => expect(screen.getByTestId('dm-send')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('dm-composer-input'), { target: { value: 'look' } });
    fireEvent.submit(screen.getByTestId('dm-composer'));
    expect(actions.sendDirectFile).toHaveBeenCalledWith(PEER, meta('cat.png'));
    expect(actions.sendDirectMessage).toHaveBeenCalledWith(PEER, 'look', []);
    expect(screen.queryByTestId('dm-pending-file')).toBeNull();
  });

  it('says a failed file send in the reader\'s language, with its code when it has one', async () => {
    encryptAndUploadDmFile.mockResolvedValue(meta('cat.png'));
    actions.sendDirectFile.mockRejectedValueOnce(new CodedError('files-need-nip17', 'encrypted files need NIP-17'));
    const { container } = render(<LocaleProvider initialLocale="es"><DmComposer peer={PEER} variant="desktop" /></LocaleProvider>);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['px'], 'cat.png', { type: 'image/png' })] } });
    await waitFor(() => expect(screen.getByTestId('dm-send')).not.toBeDisabled());
    fireEvent.submit(screen.getByTestId('dm-composer'));
    expect(await screen.findByText(translator('es')('errors.codes.files-need-nip17'))).toBeInTheDocument();
  });

  it('refuses a file type outside the allowlist without uploading', () => {
    const { container } = renderLocalized(<DmComposer peer={PEER} variant="desktop" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.exe', { type: 'application/x-msdownload' })] } });
    expect(encryptAndUploadDmFile).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent("isn't supported");
  });

  it('hides attachments and voice notes on a NIP-04 thread', () => {
    useDMStore.setState({ protocolOverrides: { [PEER]: 'nip04' } });
    const { container } = renderLocalized(<DmComposer peer={PEER} variant="mobile" />);
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByTestId('voice-recording-controls')).toBeNull();
    expect(screen.queryByLabelText(/record/i)).toBeNull();
  });

  it('names the message field for screen readers', () => {
    renderLocalized(<DmComposer peer={PEER} variant="desktop" />);
    expect(screen.getByRole('textbox', { name: 'Encrypted message' })).toBe(screen.getByTestId('dm-composer-input'));
  });

  it('holds a pasted image as a pending file instead of typing it', () => {
    encryptAndUploadDmFile.mockImplementation(() => new Promise(() => {}));
    renderLocalized(<DmComposer peer={PEER} variant="desktop" />);
    const file = new File(['px'], 'shot.png', { type: 'image/png' });
    fireEvent.paste(screen.getByTestId('dm-composer-input'), {
      clipboardData: { items: [{ kind: 'file', getAsFile: () => file }] },
    });
    expect(screen.getByTestId('dm-pending-file')).toBeInTheDocument();
    expect(encryptAndUploadDmFile).toHaveBeenCalledWith(file);
  });

  it('closes the desktop picker on a press outside it', () => {
    renderLocalized(<DmComposer peer={PEER} variant="desktop" />);
    const trigger = screen.getByRole('button', { name: 'Open emoji, GIF, and sticker picker' });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.mouseDown(document.body);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});

