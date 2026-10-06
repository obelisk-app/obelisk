/**
 * The pure half of voice presence: who is in a call, derived from the mesh
 * beacons (kind 20078), the SFU's presence beacons and its active-call
 * advertisements (kind 31314). Pure move from `voice-presence.ts`.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { getAllTags } from './event-tags';

export interface ActiveCallInfo {
  hostPubkey: string;
  status: string;
  participantCount: number;
  expiresAt: number;
  createdAt: number;
  mode?: 'sfu' | 'mesh';
  participantPubkeys?: string[];
}

export interface SfuActiveCall {
  hostPubkey: string;
  status: string;
  participantCount: number;
  expiresAt: number;
  createdAt: number;
  mode: 'sfu';
  participantPubkeys?: string[];
}
export interface SfuPresence { expiresAt: number; createdAt: number; participantPubkeys: string[] }
export interface MeshPresence { expiresAt: number; createdAt: number }

/** The roster an SFU advertisement names: its `p` tags plus a JSON `participants` list. */
export function parseSfuParticipantPubkeys(ev: NostrEvent): string[] {
  const fromTags = getAllTags(ev, 'p');
  let fromContent: string[] = [];
  if (ev.content.trim().length > 0) {
    try {
      const parsed = JSON.parse(ev.content) as { participants?: unknown };
      if (Array.isArray(parsed?.participants)) {
        fromContent = parsed.participants.filter((pk): pk is string => typeof pk === 'string' && pk.length > 0);
      }
    } catch {
      // Older SFU builds used empty content; malformed content should not
      // discard the tag-sourced roster.
    }
  }
  return mergePubkeys(fromTags, fromContent);
}

/** Union of pubkey lists, deduped and sorted. */
export function mergePubkeys(...sets: Array<readonly string[] | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const set of sets) {
    if (!set) continue;
    for (const pk of set) {
      if (!pk || seen.has(pk)) continue;
      seen.add(pk);
      out.push(pk);
    }
  }
  return out.sort();
}

/**
 * One entry per channel with anyone in it: mesh rooms from the beacons,
 * SFU rooms from the SFU's presence, then the SFU's own advertisement on
 * top (its count wins when larger; -1 means the SFU does not count).
 */
export function deriveActiveCalls(
  mesh: ReadonlyMap<string, ReadonlyMap<string, MeshPresence>>,
  sfu: ReadonlyMap<string, ReadonlyMap<string, SfuPresence>>,
  sfuActiveCalls: ReadonlyMap<string, SfuActiveCall>,
): Record<string, ActiveCallInfo> {
  const next: Record<string, ActiveCallInfo> = {};

  for (const [channelId, byPubkey] of mesh.entries()) {
    const pubkeys = Array.from(byPubkey.keys()).sort();
    if (pubkeys.length === 0) continue;
    let createdAt = 0;
    let expiresAt = Number.MAX_SAFE_INTEGER;
    for (const presence of byPubkey.values()) {
      createdAt = Math.max(createdAt, presence.createdAt);
      expiresAt = Math.min(expiresAt, presence.expiresAt);
    }
    next[channelId] = {
      hostPubkey: pubkeys[0],
      status: 'active',
      participantCount: pubkeys.length,
      expiresAt,
      createdAt,
      mode: 'mesh',
      participantPubkeys: pubkeys,
    };
  }

  const sfuPresence: Record<string, {
    hostPubkey: string;
    participantPubkeys: string[];
    expiresAt: number;
    createdAt: number;
  }> = {};
  for (const [channelId, bySfu] of sfu.entries()) {
    let createdAt = 0;
    let expiresAt = Number.MAX_SAFE_INTEGER;
    let hostPubkey = '';
    let participantPubkeys: string[] = [];
    for (const [sfuPubkey, presence] of bySfu.entries()) {
      if (!hostPubkey || presence.createdAt > createdAt) hostPubkey = sfuPubkey;
      createdAt = Math.max(createdAt, presence.createdAt);
      expiresAt = Math.min(expiresAt, presence.expiresAt);
      participantPubkeys = mergePubkeys(participantPubkeys, presence.participantPubkeys);
    }
    if (participantPubkeys.length === 0) continue;
    sfuPresence[channelId] = { hostPubkey, participantPubkeys, expiresAt, createdAt };
    next[channelId] = {
      hostPubkey,
      status: 'active',
      participantCount: participantPubkeys.length,
      expiresAt,
      createdAt,
      mode: 'sfu',
      participantPubkeys,
    };
  }

  for (const [channelId, call] of sfuActiveCalls.entries()) {
    const presence = sfuPresence[channelId];
    const participantPubkeys = mergePubkeys(call.participantPubkeys, presence?.participantPubkeys);
    const participantCount = call.participantCount >= 0
      ? Math.max(call.participantCount, participantPubkeys.length)
      : (participantPubkeys.length > 0 ? participantPubkeys.length : call.participantCount);
    next[channelId] = {
      ...call,
      participantCount,
      participantPubkeys: participantPubkeys.length > 0 ? participantPubkeys : call.participantPubkeys,
    };
  }
  return next;
}
