import { describe, expect, it } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { buildNotePreview, plainTextForPreview, previewImage } from './note-preview';

const ev = (over: Partial<NostrEvent> = {}): NostrEvent => ({
  id: 'a'.repeat(64),
  pubkey: 'b'.repeat(64),
  content: '',
  created_at: 1000,
  tags: [],
  kind: 1,
  sig: '',
  ...over,
});

describe('plainTextForPreview', () => {
  it('strips markdown syntax that reads as noise in a card', () => {
    expect(plainTextForPreview('## Title\n\n**bold** and _italic_ and `code`'))
      .toBe('Title bold and italic and code');
  });

  it('keeps link text but drops the URL', () => {
    expect(plainTextForPreview('see [the docs](https://example.com/x) now'))
      .toBe('see the docs now');
  });

  it('drops bech32 mentions, which are 60 chars of noise', () => {
    const out = plainTextForPreview('hey nostr:npub1abcdefghijklmnop look');
    expect(out).toBe('hey look');
  });

  it('drops bare urls and collapses the whitespace they leave', () => {
    expect(plainTextForPreview('look https://example.com/a.jpg at this')).toBe('look at this');
  });
});

describe('previewImage', () => {
  it('prefers an explicit image tag', () => {
    expect(previewImage(ev({ tags: [['image', 'https://cdn.example/hero.jpg']] })))
      .toBe('https://cdn.example/hero.jpg');
  });

  it('falls back to the imeta url', () => {
    expect(previewImage(ev({ tags: [['imeta', 'url https://cdn.example/a.png', 'm image/png']] })))
      .toBe('https://cdn.example/a.png');
  });

  it('finally falls back to an image url in the content', () => {
    expect(previewImage(ev({ content: 'hi https://cdn.example/b.webp' })))
      .toBe('https://cdn.example/b.webp');
  });

  it('is null when there is no image', () => {
    expect(previewImage(ev({ content: 'just text' }))).toBeNull();
  });
});

describe('buildNotePreview', () => {
  it('titles a plain note with its author, since notes have no title', () => {
    const preview = buildNotePreview(ev({ content: 'gm nostr' }), 'Alice');
    expect(preview.title).toBe('Alice on Obelisk');
    expect(preview.description).toBe('gm nostr');
    expect(preview.isArticle).toBe(false);
  });

  it('uses the article title and summary for long-form', () => {
    const preview = buildNotePreview(ev({
      kind: 30023,
      content: '## Body',
      tags: [['title', 'On Relays'], ['summary', 'Why they matter.']],
    }), 'Alice');
    expect(preview).toMatchObject({
      title: 'On Relays',
      description: 'Why they matter.',
      isArticle: true,
    });
  });

  it('says something for an image-only post rather than going blank', () => {
    const preview = buildNotePreview(ev({ content: 'https://cdn.example/a.jpg' }), 'Alice');
    expect(preview.description).toBe('Shared media');
    expect(preview.image).toBe('https://cdn.example/a.jpg');
  });

  it('truncates on a word boundary', () => {
    const long = `${'word '.repeat(80)}end`;
    const preview = buildNotePreview(ev({ content: long }), 'Alice');
    expect(preview.description.length).toBeLessThanOrEqual(201);
    expect(preview.description.endsWith('…')).toBe(true);
    // Not cut mid-word.
    expect(preview.description).not.toMatch(/wo…$/);
  });
});
