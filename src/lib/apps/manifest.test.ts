import { describe, expect, it } from 'vitest';

import { aggregateHash, appAddress, latestPerAddress, parseManifest } from './manifest';
import { AUTHOR, manifestEvent, PATHS } from './test-helpers';

describe('parseManifest', () => {
  it('reads a well-formed manifest', () => {
    const m = parseManifest(manifestEvent())!;
    expect(m).toMatchObject({
      address: appAddress(AUTHOR, 'chain-reaction'),
      slug: 'chain-reaction', title: 'Chain Reaction', api: 1, runnable: true,
      types: ['game'], players: { min: 2, max: 8 }, realtime: false, icon: '/music/a.mp3',
      aggregate: aggregateHash(PATHS),
    });
    expect(m.paths).toEqual(PATHS);
  });

  it('keeps only https server hints, as origins', () => {
    expect(parseManifest(manifestEvent())!.servers).toEqual(['https://blossom.obelisk.ar']);
  });

  it('refuses a manifest whose aggregate does not match its paths', () => {
    const bad = manifestEvent({ drop: ['x'], tags: [['x', '0'.repeat(64), 'aggregate']] });
    expect(parseManifest(bad)).toBeNull();
  });

  it('refuses missing required tags, bad slugs and a missing entry', () => {
    expect(parseManifest(manifestEvent({ drop: ['title'] }))).toBeNull();
    expect(parseManifest(manifestEvent({ drop: ['api'] }))).toBeNull();
    expect(parseManifest(manifestEvent({ drop: ['d'], tags: [['d', 'Bad Slug']] }))).toBeNull();
    const noEntry = [{ path: '/other.js', sha256: '1'.repeat(64) }];
    expect(parseManifest(manifestEvent({
      drop: ['path', 'x', 'icon'],
      tags: [['path', '/other.js', '1'.repeat(64)], ['x', aggregateHash(noEntry), 'aggregate']],
    }))).toBeNull();
  });

  it('refuses path traversal and malformed hashes', () => {
    const evil = [{ path: '/index.js', sha256: '1'.repeat(64) }, { path: '/../etc/passwd', sha256: '3'.repeat(64) }];
    expect(parseManifest(manifestEvent({
      drop: ['path', 'x', 'icon'],
      tags: [...evil.map((p) => ['path', p.path, p.sha256]), ['x', aggregateHash(evil), 'aggregate']],
    }))).toBeNull();
  });

  it('lists an app for a newer host API but marks it not runnable', () => {
    const m = parseManifest(manifestEvent({ drop: ['api'], tags: [['api', '2']] }))!;
    expect(m.runnable).toBe(false);
  });

  it('ignores an icon that is not one of its own paths', () => {
    expect(parseManifest(manifestEvent({ drop: ['icon'], tags: [['icon', 'https://tracker.example/pixel.png']] }))!.icon).toBeNull();
  });
});

describe('latestPerAddress', () => {
  it('keeps the newest version of each app, lower id on a tie', () => {
    const old = parseManifest(manifestEvent({ created_at: 1000, id: 'b'.repeat(64) }))!;
    const tieLow = parseManifest(manifestEvent({ created_at: 2000, id: 'a'.repeat(64) }))!;
    const tieHigh = parseManifest(manifestEvent({ created_at: 2000, id: 'c'.repeat(64) }))!;
    const other = parseManifest(manifestEvent({ pubkey: '9'.repeat(64) }))!;
    const out = latestPerAddress([old, tieHigh, tieLow, other]);
    expect(out).toHaveLength(2);
    expect(out.find((m) => m.author === AUTHOR)!.eventId).toBe('a'.repeat(64));
  });
});
