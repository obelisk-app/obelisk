import { describe, expect, it, vi } from 'vitest';
import { VoiceClientSurface } from '@/services/voice/client-surface';
import type { MeshSession } from '@/services/voice/mesh-session';
import type { SfuSession } from '@/services/voice/sfu-session';
import type { LocalMedia } from '@/services/voice/local-media';
import type { VoiceUiSink } from '@/services/voice/ui-sink';
import type { RoomState } from '@/services/voice/room-state';
import type { RoomMembership } from '@/services/voice/membership';
import type { TopologySwitch } from '@/services/voice/topology-switch';

/** A surface over hand-rolled collaborators, recording what reaches them. */
function surface(members: string[], open = false) {
  const calls: string[] = [];
  const peers = new Map<string, { pc?: { connectionState: RTCPeerConnectionState } }>([
    ['member', { pc: { connectionState: 'connected' } }],
    ['stranger', {}],
  ]);
  let isOpen = open;
  const membership = {
    get open() { return isOpen; },
    setOpen: (next: boolean) => { const changed = next !== isOpen; isOpen = next; return changed; },
    update: () => { calls.push('membership.update'); },
    isMember: (pk: string) => isOpen || members.includes(pk),
  };
  const mesh = {
    tearDownPeer: (pk: string) => { calls.push(`tearDown:${pk}`); peers.delete(pk); },
    drainDeferredSignals: () => { calls.push('drain'); },
    scheduleDialFromDiscovery: () => { calls.push('dial'); },
  };
  class Probe extends VoiceClientSurface {
    protected readonly ui = { setPeerMuted: vi.fn() } as unknown as VoiceUiSink;
    protected readonly membership = membership as unknown as RoomMembership;
    protected readonly topology = {} as TopologySwitch;
    protected readonly room = { peers, connectedPubkeys: new Set(['member']) } as unknown as RoomState;
    protected readonly mesh = mesh as unknown as MeshSession;
    protected readonly sfu = { pubkey: null } as unknown as SfuSession;
    protected readonly localMedia = { setMicEnabled: vi.fn(async () => { calls.push('mic'); }) } as unknown as LocalMedia;
  }
  return { client: new Probe(), calls };
}

describe('VoiceClientSurface', () => {
  it('drains deferred signals before evicting peers the new roles drop', () => {
    const { client, calls } = surface(['member']);
    client.updateRoles(['member'], []);
    expect(calls).toEqual(['membership.update', 'drain', 'tearDown:stranger']);
  });

  it('locking an open room re-dials, then drops non-members', () => {
    const { client, calls } = surface(['member'], true);
    client.setOpen(false);
    expect(calls).toEqual(['dial', 'tearDown:stranger']);
  });

  it('opening a room evicts nobody, and an unchanged flag does nothing', () => {
    const { client, calls } = surface(['member'], false);
    client.setOpen(true);
    client.setOpen(true);
    expect(calls).toEqual(['dial']);
  });

  it('reads peer state without inventing peers', () => {
    const { client } = surface(['member']);
    expect(client.getPeerConnectionState('member')).toBe('connected');
    expect(client.getPeerConnectionState('nobody')).toBeNull();
    expect(client.getConnectedPubkeys()).toEqual(['member']);
    expect(client.getSfuPubkey()).toBeNull();
  });

  it('hands media controls to local media', async () => {
    const { client, calls } = surface(['member']);
    await client.setMicEnabled(true);
    expect(calls).toEqual(['mic']);
  });
});
