import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DmMessageBody } from './DmMessageBody';
import { LocaleProvider } from '@/i18n/context';
import type { JsDirectMessage } from '@/lib/nostr-bridge/types';

const renderLocalized = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);
const msg = (over: Partial<JsDirectMessage>): JsDirectMessage => ({
  id: 'x', counterparty: 'p', outgoing: false, content: '', createdAt: 1, ...over,
});

describe('DmMessageBody', () => {
  it('renders plain text with custom emoji and links, but no unfurl card', () => {
    renderLocalized(<DmMessageBody message={msg({ content: 'hi :blob: see https://example.com/page', customEmojis: { blob: 'https://e.example/blob.png' } })} />);
    expect(screen.getByAltText(':blob:')).toHaveAttribute('src', 'https://e.example/blob.png');
    expect(screen.getByRole('link', { name: 'https://example.com/page' })).toBeInTheDocument();
    expect(document.querySelector('[data-testid="link-preview"]')).toBeNull();
  });

  it('renders a sticker as the sticker', () => {
    renderLocalized(<DmMessageBody message={msg({ content: ':cat:', sticker: { name: 'cat', url: 'https://s.example/cat.webp' } })} />);
    expect(screen.getByTestId('dm-sticker')).toHaveAttribute('src', 'https://s.example/cat.webp');
  });

  it('hoists image / GIF urls out of the text', () => {
    renderLocalized(<DmMessageBody message={msg({ content: 'look\nhttps://g.example/a.gif' })} />);
    expect(screen.getByText('look')).toBeInTheDocument();
    expect(screen.getByTestId('dm-images').querySelector('img')).toHaveAttribute('src', 'https://g.example/a.gif');
  });

  it('routes a file message to the encrypted attachment', () => {
    renderLocalized(<DmMessageBody message={msg({
      content: 'https://b.example/c',
      file: { url: 'https://b.example/c', mimeType: 'application/pdf', algorithm: 'aes-gcm', key: 'aa', nonce: 'bb', x: '', name: 'a.pdf' },
    })} />);
    expect(screen.getByTestId('dm-file-card')).toHaveTextContent('a.pdf');
  });
});
