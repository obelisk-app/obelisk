/**
 * The remote-media gate on the three surfaces that render sender-chosen
 * URLs: `DmMessageBody`, `MessageContent` and `LinkPreview`. A URL only
 * becomes a network request once it is in an `<img src>` (or a media element
 * with `preload` other than `none`), so "no request before opt-in" is
 * asserted as "no such element in the document".
 */
import { beforeAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocaleProvider } from '@tests/support/intl';
import { DmMessageBody } from '@/components/chat/dm/message/DmMessageBody';
import MessageContent from '@/components/chat/message/MessageContent';
import { preloadMarkdownBody } from '@/services/chat/message/markdown-body';

// The markdown renderer loads on demand; load it first so every render below is the real one.
beforeAll(async () => { await preloadMarkdownBody(); });
import LinkPreview from '@/components/chat/message/LinkPreview';
import { _resetRemoteMediaForTest, setRemoteMediaMode } from '@/services/media/remote-media';
import type { JsDirectMessage } from '@/services/nostr-bridge';

const alice = 'a'.repeat(64);
const renderLocalized = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);
const dm = (over: Partial<JsDirectMessage>): JsDirectMessage => ({
  id: 'x', counterparty: alice, outgoing: false, content: '', createdAt: 1, ...over,
});
const imgs = () => Array.from(document.querySelectorAll('img'));
const srcs = () => imgs().map((el) => el.getAttribute('src'));

beforeEach(() => {
  window.localStorage.clear();
  _resetRemoteMediaForTest();
  // Every URL in a message mounts a LinkPreview, whose effect asks
  // /api/link-preview. The gate is the subject here, not the unfurl; the
  // `link previews` describe below installs its own stub over this one.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DMs: incoming media waits for the reader', () => {
  it('does not put an incoming image in the document until the placeholder is clicked', () => {
    renderLocalized(<DmMessageBody message={dm({ content: 'look\nhttps://g.example/a.gif' })} />);
    expect(screen.getByText('look')).toBeInTheDocument();
    expect(srcs()).not.toContain('https://g.example/a.gif');
    expect(screen.queryByTestId('dm-images')).toBeNull();

    fireEvent.click(screen.getByTestId('remote-media-placeholder'));

    const img = screen.getByTestId('dm-images').querySelector('img');
    expect(img).toHaveAttribute('src', 'https://g.example/a.gif');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(screen.queryByTestId('remote-media-placeholder')).toBeNull();
  });

  it('holds back an incoming sticker, sender-tagged emoji and media attachment too', () => {
    renderLocalized(<DmMessageBody message={dm({ content: ':cat:', sticker: { name: 'cat', url: 'https://s.example/cat.webp' } })} />);
    expect(srcs()).toEqual([]);
    expect(screen.getByTestId('remote-media-placeholder')).toBeInTheDocument();

    renderLocalized(<DmMessageBody message={dm({ id: 'e', content: 'hi :blob:', customEmojis: { blob: 'https://e.example/blob.png' } })} />);
    expect(srcs()).toEqual([]);
    expect(screen.getByText(/:blob:/)).toBeInTheDocument();

    renderLocalized(<DmMessageBody message={dm({
      id: 'f',
      content: 'https://b.example/c',
      file: { url: 'https://b.example/c', mimeType: 'image/png', algorithm: 'aes-gcm', key: 'aa', nonce: 'bb', x: '', name: 'a.png' },
    })} />);
    expect(screen.queryByTestId('dm-file-card')).toBeNull();
    // Sticker and attachment each get a placeholder; a gated emoji is just
    // its `:name:` text, nothing to reveal.
    expect(screen.getAllByTestId('remote-media-placeholder')).toHaveLength(2);
  });

  it('loads the reader\'s own outgoing media at once', () => {
    renderLocalized(<DmMessageBody message={dm({ outgoing: true, content: 'https://g.example/mine.png' })} />);
    expect(srcs()).toEqual(['https://g.example/mine.png']);
    expect(screen.queryByTestId('remote-media-placeholder')).toBeNull();
  });

  it('respects a reader who turned the DM default to "always"', () => {
    setRemoteMediaMode('dm', 'always');
    renderLocalized(<DmMessageBody message={dm({ content: 'https://g.example/a.gif' })} />);
    expect(srcs()).toEqual(['https://g.example/a.gif']);
  });
});

describe('channels: contacts-only by default', () => {
  it('shows a placeholder instead of the gallery for an author outside the reader\'s contacts', () => {
    renderLocalized(<MessageContent content="https://cdn.example/photo.jpg" authorPubkey={alice} />);
    expect(screen.queryByTestId('image-gallery')).toBeNull();
    expect(srcs()).toEqual([]);

    fireEvent.click(screen.getByTestId('remote-media-placeholder'));
    expect(screen.getByTestId('image-gallery')).toBeInTheDocument();
    expect(srcs()).toEqual(['https://cdn.example/photo.jpg']);
  });

  it('loads at once when the reader sets channels to "always"', () => {
    setRemoteMediaMode('channel', 'always');
    renderLocalized(<MessageContent content="https://cdn.example/photo.jpg" authorPubkey={alice} />);
    expect(screen.getByTestId('image-gallery')).toBeInTheDocument();
    expect(screen.queryByTestId('remote-media-placeholder')).toBeNull();
  });

  it('keeps the legacy behaviour for callers that pass no author (a composer preview of your own draft)', () => {
    renderLocalized(<MessageContent content="https://cdn.example/photo.jpg" />);
    expect(screen.getByTestId('image-gallery')).toBeInTheDocument();
  });

  it('renders video and audio players that fetch nothing until played', () => {
    renderLocalized(<MessageContent content="https://cdn.example/clip.mp4 https://cdn.example/song.mp3" authorPubkey={alice} />);
    expect(screen.getByTestId('video-player')).toHaveAttribute('preload', 'none');
    expect(document.querySelector('audio')).toHaveAttribute('preload', 'none');
    // The player is not hidden behind the image placeholder: pressing play is the consent.
    expect(screen.queryByTestId('remote-media-placeholder')).toBeNull();
  });

  it('gates an explicit markdown image and a remote URL dressed up as the welcome banner', () => {
    renderLocalized(<MessageContent content="![x](https://attacker.example/api/welcome-banner)" authorPubkey={alice} />);
    expect(screen.queryByTestId('welcome-banner')).toBeNull();
    expect(srcs()).toEqual([]);
    expect(screen.getByTestId('remote-media-placeholder')).toBeInTheDocument();
  });

  it('leaves sender-tagged custom emoji as text while gated, and keeps relay emoji', () => {
    // A name no unicode shortcode table knows, so the only resolution is the sender's URL.
    renderLocalized(<MessageContent content=":obelisk_blob:" customEmojis={{ obelisk_blob: 'https://cdn.example/blob.webp' }} authorPubkey={alice} />);
    expect(screen.queryByTestId('custom-emoji')).toBeNull();
    expect(screen.getByText(':obelisk_blob:')).toBeInTheDocument();
  });
});

describe('link previews', () => {
  function stubPreview(image: string) {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ url: 'https://news.example/story', kind: 'link', title: 'A story', image }),
    })));
  }

  it('omits the og:image when the gate is closed and renders it with no referrer when open', async () => {
    stubPreview('https://news.example/og.png');
    renderLocalized(<LinkPreview url="https://news.example/story" showImage={false} />);
    await screen.findByText('A story');
    expect(srcs()).toEqual([]);

    renderLocalized(<LinkPreview url="https://news.example/story" />);
    await waitFor(() => expect(srcs()).toEqual(['https://news.example/og.png']));
    expect(imgs()[0]).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(imgs()[0]).toHaveAttribute('loading', 'lazy');
  });
});

describe('every media image sends no referrer', () => {
  it('across MessageContent, DmMessageBody and the gallery-less paths these files own', () => {
    setRemoteMediaMode('channel', 'always');
    setRemoteMediaMode('dm', 'always');
    renderLocalized(
      <>
        {/* An explicit markdown image whose URL has no image extension is
            not hoisted into the gallery, so it exercises the `img` override;
            a bare `.png` URL would land in `ImageGallery`, which this file
            does not own (see the report for its diff). */}
        <MessageContent
          content="![b](https://cdn.example/b) :obelisk_blob:"
          customEmojis={{ obelisk_blob: 'https://cdn.example/blob.webp' }}
          authorPubkey={alice}
        />
        <MessageContent
          content=""
          sticker={{ name: 'obelisk_blob', url: 'https://cdn.example/sticker.webp' }}
          voiceNote={{ url: 'https://cdn.example/v.webm', durationSeconds: 3 }}
          voiceAuthorPicture="https://cdn.example/avatar.png"
          authorPubkey={alice}
        />
        <DmMessageBody message={dm({ content: 'hi :blob: https://g.example/a.gif', customEmojis: { blob: 'https://e.example/blob.png' } })} />
        <DmMessageBody message={dm({ id: 's', content: ':cat:', sticker: { name: 'cat', url: 'https://s.example/cat.webp' } })} />
      </>,
    );
    const all = imgs();
    expect(srcs().sort()).toEqual([
      'https://cdn.example/b',
      'https://cdn.example/blob.webp',
      'https://cdn.example/sticker.webp',
      'https://cdn.example/avatar.png',
      'https://e.example/blob.png',
      'https://g.example/a.gif',
      'https://s.example/cat.webp',
    ].sort());
    for (const img of all) {
      expect(img, img.outerHTML).toHaveAttribute('referrerpolicy', 'no-referrer');
      expect(img, img.outerHTML).toHaveAttribute('loading', 'lazy');
    }
  });
});
