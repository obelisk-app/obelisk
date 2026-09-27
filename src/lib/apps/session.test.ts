import { describe, expect, it } from 'vitest';

import { aggregateHash } from './manifest';
import { appMarker, buildSessionCreate, extractAppMarkers, readPin, summarizeSession } from './session';
import { AUTHOR, B, C, CH, ev, HOST, PATHS, sessionEvent } from './test-helpers';

const address = `32390:${AUTHOR}:chain-reaction`;
const manifest = { address, aggregate: aggregateHash(PATHS), paths: PATHS, api: 1, title: 'Chain Reaction' };

function create(at = 1000, id = 's'.repeat(0) + '5'.repeat(64)) {
  const t = buildSessionCreate(CH, manifest, 'nonce-1');
  return ev(HOST, at, t.kind, t.tags, t.content, id);
}

describe('buildSessionCreate / readPin', () => {
  it('pins the manifest\'s paths and aggregate, and the pin reads back', () => {
    const c = create();
    expect(c.tags).toContainEqual(['h', CH]);
    expect(c.tags).toContainEqual(['op', 'create']);
    expect(readPin(c)).toEqual({ address, aggregate: manifest.aggregate, paths: PATHS, api: 1 });
  });

  it('refuses a create whose paths were tampered with after the aggregate', () => {
    const c = create();
    const tampered = { ...c, tags: c.tags.map((t) => (t[0] === 'path' && t[1] === '/index.js' ? ['path', '/index.js', '9'.repeat(64)] : t)) };
    expect(readPin(tampered)).toBeNull();
    expect(summarizeSession([tampered])).toBeNull();
  });
});

describe('summarizeSession', () => {
  const S = '5'.repeat(64);

  it('tracks participants through joins and leaves, host first', () => {
    const s = summarizeSession([
      create(),
      sessionEvent(B, 1001, 'join', S),
      sessionEvent(C, 1002, 'join', S),
      sessionEvent(B, 1003, 'leave', S),
      sessionEvent(HOST, 1004, 'leave', S), // the host can't leave their own table
    ])!;
    expect(s.participants).toEqual([HOST, C]);
    expect(s.lastActivity).toBe(1004);
  });

  it('only the creator cancels', () => {
    expect(summarizeSession([create(), sessionEvent(B, 1001, 'cancel', S)])!.cancelled).toBe(false);
    expect(summarizeSession([create(), sessionEvent(HOST, 1001, 'cancel', S)])!.cancelled).toBe(true);
  });

  it('takes the latest status line from the creator or a participant, capped', () => {
    const s = summarizeSession([
      create(),
      sessionEvent(B, 1001, 'join', S),
      sessionEvent(HOST, 1002, 'status', S, { text: 'Waiting' }),
      sessionEvent(B, 1003, 'status', S, { text: 'B to move' }),
      sessionEvent(C, 1004, 'status', S, { text: 'spoofed by an outsider' }),
      sessionEvent(HOST, 1005, 'status', S, { text: 'x'.repeat(141) }),
    ])!;
    expect(s.status).toBe('B to move');
  });

  it('keeps every event of the session, sorted, and none from other sessions', () => {
    const s = summarizeSession([
      sessionEvent(B, 1003, 'move', S, { n: 0 }),
      create(),
      sessionEvent(B, 1001, 'join', S),
      sessionEvent(B, 1002, 'join', '6'.repeat(64)),
    ])!;
    expect(s.events.map((e) => e.created_at)).toEqual([1000, 1001, 1003]);
  });

  it('recognises a legacy table by its t tag and game name, with no pin', () => {
    const legacy = ev(HOST, 1000, 2390,
      [['h', CH], ['t', 'obelisk-game'], ['op', 'create'], ['game', 'vesta']],
      JSON.stringify({ game: 'vesta', opts: {}, turnTimeoutS: 0 }));
    const s = summarizeSession([legacy])!;
    expect(s.pin).toBeNull();
    expect(s.legacyGame).toBe('vesta');
  });

  it('returns null without a create', () => {
    expect(summarizeSession([sessionEvent(B, 1001, 'join', S)])).toBeNull();
  });
});

describe('markers', () => {
  it('extracts new and legacy markers, deduped, in order', () => {
    const a = '1'.repeat(64);
    const b = '2'.repeat(64);
    expect(appMarker(a)).toBe(`[[app:${a}]]`);
    expect(extractAppMarkers(`hi [[app:${a}]] and [[game:${b}]] and [[app:${a}]]`)).toEqual([a, b]);
  });
});
