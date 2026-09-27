/** Event builders shared by the apps tests. Ids are deterministic; signatures are not checked here. */
import type { Event as NostrEvent } from 'nostr-tools';

import { aggregateHash, type AppPath } from './manifest';

export const AUTHOR = 'f'.repeat(64);
export const HOST = 'a'.repeat(64);
export const B = 'b'.repeat(64);
export const C = 'c'.repeat(64);
export const CH = 'channel-1';

let seq = 0;
export function ev(pubkey: string, created_at: number, kind: number, tags: string[][], content = '', id?: string): NostrEvent {
  const n = seq++;
  return {
    id: id ?? n.toString(16).padStart(64, '0'),
    pubkey, created_at, kind, tags, content, sig: '',
  } as NostrEvent;
}

export const PATHS: AppPath[] = [
  { path: '/index.js', sha256: '1'.repeat(64) },
  { path: '/music/a.mp3', sha256: '2'.repeat(64) },
];

export function manifestEvent(over: { tags?: string[][]; drop?: string[]; created_at?: number; id?: string; pubkey?: string } = {}): NostrEvent {
  const tags = [
    ['d', 'chain-reaction'],
    ['title', 'Chain Reaction'],
    ['description', 'Take the board.'],
    ['api', '1'],
    ['t', 'game'],
    ['version', '1.0.0'],
    ['players', '2', '8'],
    ['realtime', 'false'],
    ...PATHS.map((p) => ['path', p.path, p.sha256]),
    ['icon', '/music/a.mp3'],
    ['x', aggregateHash(PATHS), 'aggregate'],
    ['server', 'https://blossom.obelisk.ar'],
    ['server', 'http://insecure.example'],
  ].filter((t) => !(over.drop ?? []).includes(t[0]));
  return ev(over.pubkey ?? AUTHOR, over.created_at ?? 1000, 32390, [...tags, ...(over.tags ?? [])], 'Long **markdown**.', over.id);
}

export function sessionEvent(pubkey: string, at: number, op: string, sessionId: string, body: Record<string, unknown> = {}, id?: string) {
  return ev(pubkey, at, 2390, [['h', CH], ['t', 'obelisk-app'], ['op', op], ['e', sessionId, '', 'root']], JSON.stringify(body), id);
}
