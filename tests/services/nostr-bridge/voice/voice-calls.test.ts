import { describe, expect, it } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { deriveActiveCalls, mergePubkeys, parseSfuParticipantPubkeys, type MeshPresence, type SfuActiveCall, type SfuPresence } from '@/services/nostr-bridge/voice/voice-calls';

const ev = (tags: string[][], content = ''): NostrEvent => ({ id: 'e', pubkey: 'sfu', kind: 31314, created_at: 1, content, tags, sig: '' });

describe('voice-calls', () => {
  it('reads an SFU roster from p tags and JSON content, tolerating malformed content', () => {
    expect(parseSfuParticipantPubkeys(ev([['p', 'b'], ['p', 'a']], JSON.stringify({ participants: ['c', 'a', 3] })))).toEqual(['a', 'b', 'c']);
    expect(parseSfuParticipantPubkeys(ev([['p', 'b']], '{oops'))).toEqual(['b']);
    expect(mergePubkeys(['b', ''], undefined, ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('derives mesh rooms, SFU rooms, and lets the advertisement count win when larger', () => {
    const mesh = new Map<string, Map<string, MeshPresence>>([
      ['m', new Map([['y', { createdAt: 5, expiresAt: 90 }], ['x', { createdAt: 7, expiresAt: 80 }]])],
      ['empty', new Map()],
    ]);
    const sfu = new Map<string, Map<string, SfuPresence>>([
      ['s', new Map([['sfuA', { createdAt: 3, expiresAt: 60, participantPubkeys: ['p1'] }]])],
    ]);
    const ads = new Map<string, SfuActiveCall>([
      ['s', { hostPubkey: 'sfuA', status: 'open', participantCount: 4, expiresAt: 70, createdAt: 2, mode: 'sfu' }],
      ['s2', { hostPubkey: 'sfuB', status: 'open', participantCount: -1, expiresAt: 70, createdAt: 2, mode: 'sfu', participantPubkeys: ['q'] }],
    ]);
    const out = deriveActiveCalls(mesh, sfu, ads);
    expect(out.m).toEqual({ hostPubkey: 'x', status: 'active', participantCount: 2, expiresAt: 80, createdAt: 7, mode: 'mesh', participantPubkeys: ['x', 'y'] });
    expect(out.empty).toBeUndefined();
    expect(out.s).toMatchObject({ participantCount: 4, participantPubkeys: ['p1'], status: 'open' });
    expect(out.s2).toMatchObject({ participantCount: 1, participantPubkeys: ['q'] });
  });
});
