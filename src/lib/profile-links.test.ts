import { describe, expect, it } from 'vitest';
import { bioSegments, normalizeWebsite, prettyUrl } from './profile-links';

const NPUB = 'npub1sn0wdenkukak0d9dfczzeacvhkrgz92ak56egt7vdgzn8pv2wfqqhrjdv9';

describe('normalizeWebsite', () => {
  it('adds a scheme, because a bare host resolves against our own origin', () => {
    // Without this the one link on a profile navigates into Obelisk.
    expect(normalizeWebsite('example.com')).toBe('https://example.com');
  });

  it('leaves an absolute URL alone', () => {
    expect(normalizeWebsite('http://example.com/x')).toBe('http://example.com/x');
  });

  it('refuses text that is not a host', () => {
    expect(normalizeWebsite('ask me')).toBeNull();
    expect(normalizeWebsite('  ')).toBeNull();
    expect(normalizeWebsite(null)).toBeNull();
  });
});

describe('prettyUrl', () => {
  it('drops the scheme and a trailing slash', () => {
    expect(prettyUrl('https://example.com/')).toBe('example.com');
  });
});

describe('bioSegments', () => {
  it('returns nothing for an empty bio', () => {
    expect(bioSegments('')).toEqual([]);
    expect(bioSegments(null)).toEqual([]);
  });

  it('keeps plain text as one segment', () => {
    expect(bioSegments('just a person')).toEqual([{ type: 'text', value: 'just a person' }]);
  });

  it('links a bare URL and keeps the text around it', () => {
    const segments = bioSegments('site: https://example.com/x here');
    expect(segments).toEqual([
      { type: 'text', value: 'site: ' },
      { type: 'link', value: 'example.com/x', href: 'https://example.com/x' },
      { type: 'text', value: ' here' },
    ]);
  });

  it('does not swallow sentence punctuation into the href', () => {
    const [, link] = bioSegments('read https://example.com.');
    expect(link).toMatchObject({ href: 'https://example.com' });
  });

  it('points an npub at the profile viewer', () => {
    const segments = bioSegments(`alt: nostr:${NPUB}`);
    expect(segments.at(-1)).toMatchObject({ type: 'link', href: `/p/${NPUB}` });
  });

  it('points a note reference at the note viewer', () => {
    const id = `note1${'q'.repeat(30)}`;
    expect(bioSegments(`see ${id}`).at(-1)).toMatchObject({ href: `/notes/${id}` });
  });

  it('does not rewrite an identifier that sits inside a URL', () => {
    // A replace chain would mangle the href from the inside out.
    const segments = bioSegments(`https://njump.me/${NPUB}`);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ type: 'link', href: `https://njump.me/${NPUB}` });
  });

  it('handles several links in one bio, in order', () => {
    const segments = bioSegments('a https://one.example b https://two.example');
    expect(segments.filter((s) => s.type === 'link').map((s) => s.value))
      .toEqual(['one.example', 'two.example']);
  });
});
