import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/nostr-bridge', async (orig) => {
  const { bridgeOverrides } = await import('@tests/support/mocks/nostr-bridge');
  return { ...(await orig<typeof import('@/services/nostr-bridge')>()), ...bridgeOverrides({ useMyPubkey: () => 'a'.repeat(64) }) };
});

import { DmMessageMenu } from '@/components/chat/DmMessageMenu';
import { LocaleProvider } from '@tests/support/intl';
import type { JsDirectMessage } from '@/services/nostr-bridge';

const renderLocalized = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);
const PEER = 'b'.repeat(64);
const rumor = { id: 'r'.repeat(64), pubkey: PEER, created_at: 100, kind: 14, tags: [['p', 'a'.repeat(64)]], content: 'hello there' };
const wrap = { id: 'w'.repeat(64), pubkey: 'e'.repeat(64), created_at: 50, kind: 1059, tags: [['p', 'a'.repeat(64)]], content: 'AgEncrypted…', sig: 's'.repeat(128) };
const msg = (over: Partial<JsDirectMessage> = {}): JsDirectMessage => ({
  id: rumor.id, counterparty: PEER, outgoing: false, content: 'hello there', createdAt: 100, protocol: 'nip17',
  raw: { rumor, wire: wrap }, ...over,
});

describe('DmMessageMenu', () => {
  let written: string[] = [];
  beforeEach(() => {
    written = [];
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: async (v: string) => { written.push(v); } } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('copies text, id and the sender npub', () => {
    renderLocalized(<DmMessageMenu message={msg()} />);
    fireEvent.click(screen.getByTestId('dm-message-menu'));
    fireEvent.click(screen.getByTestId('dm-msg-copy-text'));
    fireEvent.click(screen.getByTestId('dm-message-menu'));
    fireEvent.click(screen.getByTestId('dm-msg-copy-id'));
    fireEvent.click(screen.getByTestId('dm-message-menu'));
    fireEvent.click(screen.getByTestId('dm-msg-copy-sender'));
    expect(written[0]).toBe('hello there');
    expect(written[1]).toBe(rumor.id);
    expect(written[2]).toMatch(/^npub1/);
  });

  it('every item has an icon', () => {
    renderLocalized(<DmMessageMenu message={msg()} />);
    fireEvent.click(screen.getByTestId('dm-message-menu'));
    for (const el of screen.getAllByRole('menuitem')) expect(el.querySelector('svg')).not.toBeNull();
  });

  it('shows the decrypted rumor and the gift wrap as two tabs', () => {
    renderLocalized(<DmMessageMenu message={msg()} />);
    fireEvent.click(screen.getByTestId('dm-message-menu'));
    fireEvent.click(screen.getByTestId('dm-msg-view-raw'));
    expect(screen.getByTestId('dm-raw-rumor')).toHaveTextContent('"kind": 14');
    expect(screen.getByTestId('dm-raw-rumor')).toHaveTextContent('hello there');
    fireEvent.click(screen.getByTestId('dm-raw-tab-wire'));
    expect(screen.getByTestId('dm-raw-wire')).toHaveTextContent('"kind": 1059');
    expect(screen.getByTestId('dm-raw-wire')).toHaveTextContent('one-time key');
    fireEvent.click(screen.getByTestId('dm-raw-wire-copy'));
    expect(JSON.parse(written.at(-1)!)).toMatchObject({ id: wrap.id, kind: 1059 });
  });

  it('warns when the raw rumor carries a file decryption key, and copies the file link', () => {
    const fileRumor = { ...rumor, kind: 15, content: 'https://b.example/x', tags: [...rumor.tags, ['decryption-key', 'k'.repeat(64)]] };
    const file = { url: 'https://b.example/x', mimeType: 'image/png', algorithm: 'aes-gcm', key: 'k'.repeat(64), nonce: 'n', x: '' };
    renderLocalized(<DmMessageMenu message={msg({ content: file.url, file, raw: { rumor: fileRumor, wire: wrap } })} />);
    fireEvent.click(screen.getByTestId('dm-message-menu'));
    fireEvent.click(screen.getByTestId('dm-msg-copy-file'));
    expect(written[0]).toBe(file.url);
    fireEvent.click(screen.getByTestId('dm-message-menu'));
    fireEvent.click(screen.getByTestId('dm-msg-view-raw'));
    expect(screen.getByRole('note')).toHaveTextContent('decryption key');
  });

  it('a NIP-04 message shows the kind-4 event and its decrypted content', () => {
    const k4 = { id: 'f'.repeat(64), pubkey: PEER, created_at: 100, kind: 4, tags: [['p', 'a'.repeat(64)]], content: 'cipher?iv=x', sig: 's'.repeat(128) };
    renderLocalized(<DmMessageMenu message={msg({ id: k4.id, protocol: 'nip04', raw: { wire: k4 } })} />);
    fireEvent.click(screen.getByTestId('dm-message-menu'));
    fireEvent.click(screen.getByTestId('dm-msg-view-raw'));
    expect(screen.queryByTestId('dm-raw-tab-message')).toBeNull();
    expect(screen.getByTestId('dm-raw-wire')).toHaveTextContent('"kind": 4');
    expect(screen.getByTestId('dm-raw-modal')).toHaveTextContent('Decrypted content');
    expect(screen.getByTestId('dm-raw-modal')).toHaveTextContent('hello there');
  });

  it('View raw is disabled on a message still being sent', () => {
    renderLocalized(<DmMessageMenu message={msg({ id: 'pending:x', pending: true, raw: undefined })} />);
    fireEvent.click(screen.getByTestId('dm-message-menu'));
    expect(screen.getByTestId('dm-msg-view-raw')).toBeDisabled();
    expect(screen.getByTestId('dm-msg-copy-id')).toBeDisabled();
  });
});
