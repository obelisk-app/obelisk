import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => [] as Array<{ peer: string; msg: { type: string; callId: string; eph?: string; relays?: string[] }; opts: { selfNotice?: boolean } }>);
const contacts = vi.hoisted(() => ({ list: [] as string[] }));
vi.mock('@/services/nostr-bridge/facade/client', () => {
  const bridge = {
    sendDmCallMessage: vi.fn(async (peer: string, msg: never, opts: never) => { sent.push({ peer, msg, opts }); }),
    myContactList: { get: () => ({ tags: contacts.list.map((p) => ['p', p]) }) },
    displayNameFor: (pk: string) => `name-${pk.slice(0, 4)}`,
    getPublicKey: () => ME,
    subscribeDmCallMessages: vi.fn(() => () => {}),
    subscribeDirectMessages: vi.fn(() => () => {}),
  };
  return { getBridge: async () => bridge, getBridgeImpl: () => bridge };
});

const ring = vi.hoisted(() => ({ incoming: 0, incomingStopped: 0, ringback: 0, ringbackStopped: 0 }));
vi.mock('@/services/notifications/alert', () => ({
  ringIncomingCall: () => { ring.incoming++; return { stop: () => { ring.incomingStopped++; } }; },
  startRingback: () => { ring.ringback++; return { stop: () => { ring.ringbackStopped++; } }; },
}));

const sessions = vi.hoisted(() => [] as Array<{
  opts: { role: string; relays: readonly string[]; iceTransportPolicy: string; onPhase: (p: string, r?: string) => void };
  calls: string[];
  selfEph: string;
}>);
vi.mock('@/services/call/session', () => ({
  DmCallSession: class {
    selfEph: string;
    calls: string[] = [];
    constructor(public opts: never) {
      this.selfEph = String(sessions.length + 1).repeat(64).slice(0, 64);
      sessions.push(this as never);
    }
    async acquireMedia() { this.calls.push('acquire'); }
    listen() { this.calls.push('listen'); }
    peerAccepted(eph: string) { this.calls.push(`accepted:${eph}`); }
    async answer(eph: string) { this.calls.push(`answer:${eph}`); }
    hangup() { this.calls.push('hangup'); }
    end(reason: string) { this.calls.push(`end:${reason}`); }
    setMic() {}
  },
}));

const ME = 'a'.repeat(64);
const BOB = 'b'.repeat(64);
const EVE = 'e'.repeat(64);
const CALL = 'c'.repeat(64);
const EPH = 'f'.repeat(64);

import { __resetDmCallsForTests, handleDmCallMessage, useDmCallStore } from '@/store/call/dm-call';
import { setPreference } from '@/services/preferences/preferences';
import { getBridgeImpl } from '@/services/nostr-bridge/facade/client';
import { setActiveVoiceClient } from '@/services/voice/active-client';
import type { VoiceClient } from '@/services/voice/client';

const invite = (from: string, callId = CALL) => ({
  type: 'invite' as const, callId, eph: EPH, relays: ['wss://call.example'], video: true, from, sentAt: Date.now() / 1000, peer: from,
});
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('dm-call store', () => {
  beforeEach(() => {
    __resetDmCallsForTests();
    sent.length = 0;
    sessions.length = 0;
    Object.assign(ring, { incoming: 0, incomingStopped: 0, ringback: 0, ringbackStopped: 0 });
    contacts.list = [BOB];
    setPreference('callsFrom', 'contacts');
    setPreference('callIpProtection', 'never');
    setPreference('callRelays', ['wss://call.example']);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); setActiveVoiceClient(null); __resetDmCallsForTests(); });

  it('a control message the bridge could not send is reported, and the call still ends', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await useDmCallStore.getState().startCall(BOB, false);
    const bridge = getBridgeImpl() as unknown as { sendDmCallMessage: ReturnType<typeof vi.fn> };
    bridge.sendDmCallMessage.mockRejectedValueOnce(new Error('inbox relay down'));
    await vi.advanceTimersByTimeAsync(46_000);
    expect(useDmCallStore.getState().endReason).toBe('no-answer');
    expect(warn).toHaveBeenCalledWith('[dm-call]', 'cancel', 'not delivered', expect.any(Error));
  });

  it('a group call whose leave() rejects is still handed over, with the failure named', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const leave = vi.fn(async () => { throw new Error('relay hung'); });
    setActiveVoiceClient({ leave } as unknown as VoiceClient);
    await useDmCallStore.getState().startCall(BOB, false);
    expect(leave).toHaveBeenCalledTimes(1);
    expect(useDmCallStore.getState().status).toBe('outgoing');
    expect(warn).toHaveBeenCalledWith('[dm-call] leaving the group call failed; the DM call goes on', expect.any(Error));
  });

  it('an outgoing call sends an invite with our throwaway key and the call relays, then connects on accept', async () => {
    await useDmCallStore.getState().startCall(BOB, true);
    expect(useDmCallStore.getState().status).toBe('outgoing');
    expect(ring.ringback).toBe(1);
    const inv = sent.find((s) => s.msg.type === 'invite')!;
    expect(inv.peer).toBe(BOB);
    expect(inv.msg.eph).toBe(sessions[0].selfEph);
    expect(inv.msg.relays).toEqual(['wss://call.example']);
    const callId = inv.msg.callId;

    handleDmCallMessage({ type: 'accept', callId, eph: EPH, from: BOB, sentAt: 0, peer: BOB }, ME);
    expect(useDmCallStore.getState().status).toBe('connecting');
    expect(sessions[0].calls).toEqual(['acquire', 'listen', `accepted:${EPH}`]);
    expect(ring.ringbackStopped).toBe(1);

    sessions[0].opts.onPhase('connected');
    expect(useDmCallStore.getState().status).toBe('active');
    expect(useDmCallStore.getState().connectedAt).not.toBeNull();
  });

  it("the callee's hello on the call relay moves the call on before the accept lands", async () => {
    await useDmCallStore.getState().startCall(BOB, false);
    (sessions[0].opts as unknown as { onPeerJoined: () => void }).onPeerJoined();
    expect(useDmCallStore.getState().status).toBe('connecting');
    expect(ring.ringbackStopped).toBe(1);
    // The late accept still reaches the session, and doesn't regress the state.
    handleDmCallMessage({ type: 'accept', callId: sent[0].msg.callId, eph: EPH, from: BOB, sentAt: 0, peer: BOB }, ME);
    expect(sessions[0].calls).toContain(`accepted:${EPH}`);
    expect(useDmCallStore.getState().status).toBe('connecting');
  });

  it('ignores an accept for another call or from someone else', async () => {
    await useDmCallStore.getState().startCall(BOB, false);
    const callId = sent[0].msg.callId;
    handleDmCallMessage({ type: 'accept', callId: 'd'.repeat(64), eph: EPH, from: BOB, sentAt: 0, peer: BOB }, ME);
    handleDmCallMessage({ type: 'accept', callId, eph: EPH, from: EVE, sentAt: 0, peer: EVE }, ME);
    expect(useDmCallStore.getState().status).toBe('outgoing');
  });

  it('a decline ends the outgoing call', async () => {
    await useDmCallStore.getState().startCall(BOB, false);
    handleDmCallMessage({ type: 'decline', callId: sent[0].msg.callId, from: BOB, sentAt: 0, peer: BOB }, ME);
    expect(useDmCallStore.getState()).toMatchObject({ status: 'ended', endReason: 'declined' });
  });

  it('gives up after the ring timeout and tells the callee', async () => {
    vi.useFakeTimers();
    await useDmCallStore.getState().startCall(BOB, false);
    await vi.advanceTimersByTimeAsync(46_000);
    expect(useDmCallStore.getState().endReason).toBe('no-answer');
    expect(sent.some((s) => s.msg.type === 'cancel')).toBe(true);
  });

  it('rings for an invite from a contact; accepting subscribes before sending the accept', async () => {
    handleDmCallMessage(invite(BOB), ME);
    expect(useDmCallStore.getState()).toMatchObject({ status: 'incoming', peer: BOB, video: true });
    expect(ring.incoming).toBe(1);

    await useDmCallStore.getState().acceptCall(true);
    await flush();
    expect(ring.incomingStopped).toBe(1);
    expect(sessions[0].opts.role).toBe('callee');
    expect(sessions[0].opts.relays).toEqual(['wss://call.example']);
    expect(sessions[0].calls).toEqual(['acquire', `answer:${EPH}`]);
    const acc = sent.find((s) => s.msg.type === 'accept')!;
    expect(acc.msg.eph).toBe(sessions[0].selfEph);
    expect(acc.opts.selfNotice).toBe(true);
  });

  it('drops an invite from a stranger under contacts-only, rings under anyone', () => {
    handleDmCallMessage(invite(EVE), ME);
    expect(useDmCallStore.getState().status).toBe('idle');
    expect(ring.incoming).toBe(0);
    setPreference('callsFrom', 'anyone');
    handleDmCallMessage(invite(EVE), ME);
    expect(useDmCallStore.getState().status).toBe('incoming');
  });

  it('answers busy to a second invite', () => {
    contacts.list = [BOB, EVE];
    handleDmCallMessage(invite(BOB), ME);
    handleDmCallMessage(invite(EVE, 'd'.repeat(64)), ME);
    expect(useDmCallStore.getState().peer).toBe(BOB);
    return flush().then(() => expect(sent).toContainEqual(expect.objectContaining({ peer: EVE, msg: expect.objectContaining({ type: 'busy' }) })));
  });

  it('stops ringing when we answered on another device, or the caller cancelled', () => {
    handleDmCallMessage(invite(BOB), ME);
    handleDmCallMessage({ type: 'accept', callId: CALL, eph: EPH, from: ME, sentAt: 0, peer: BOB }, ME);
    expect(useDmCallStore.getState()).toMatchObject({ status: 'ended', endReason: 'answered-elsewhere' });
    expect(ring.incomingStopped).toBe(1);

    __resetDmCallsForTests();
    handleDmCallMessage(invite(BOB, 'd'.repeat(64)), ME);
    handleDmCallMessage({ type: 'cancel', callId: 'd'.repeat(64), from: BOB, sentAt: 0, peer: BOB }, ME);
    expect(useDmCallStore.getState().endReason).toBe('missed');
  });

  it('forces relay-only ICE when IP protection is always', async () => {
    setPreference('callIpProtection', 'always');
    await useDmCallStore.getState().startCall(BOB, false);
    expect(sessions[0].opts.iceTransportPolicy).toBe('relay');
    expect(useDmCallStore.getState().relayOnly).toBe(true);
  });

  it('hanging up an active call says bye on both paths', async () => {
    await useDmCallStore.getState().startCall(BOB, false);
    const callId = sent[0].msg.callId;
    handleDmCallMessage({ type: 'accept', callId, eph: EPH, from: BOB, sentAt: 0, peer: BOB }, ME);
    sessions[0].opts.onPhase('connected');
    useDmCallStore.getState().hangup();
    await flush();
    expect(sessions[0].calls).toContain('hangup');
    expect(sent.some((s) => s.msg.type === 'hangup')).toBe(true);
    expect(useDmCallStore.getState().endReason).toBe('local-hangup');
  });
});
