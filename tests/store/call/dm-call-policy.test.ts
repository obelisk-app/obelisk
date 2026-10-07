import { afterEach, describe, expect, it, vi } from 'vitest';

const contacts = vi.hoisted(() => ({ list: [] as string[] }));
vi.mock('@/services/nostr-bridge/facade/client', () => {
  const bridge = {
    myContactList: { get: () => ({ tags: contacts.list.map((p) => ['p', p]) }) },
    sendDmCallMessage: vi.fn(async () => {}),
  };
  return { getBridge: async () => bridge, getBridgeImpl: () => bridge };
});
vi.mock('@/services/voice/ice-config', () => ({ HAS_TURN: true }));

import { iceTransportPolicyFor, leaveGroupVoice, lost, mayRing } from '@/store/call/dm-call-policy';
import { setPreference } from '@/services/preferences/preferences';
import { useModerationStore } from '@/store/moderation';
import { getActiveVoiceClient, setActiveVoiceClient } from '@/services/voice/active-client';
import type { VoiceClient } from '@/services/voice/client';

const FRIEND = 'b'.repeat(64);
const STRANGER = 'e'.repeat(64);

afterEach(() => {
  contacts.list = [];
  useModerationStore.setState({ mutedPubkeys: [], blockedPubkeys: [] });
  setPreference('callsFrom', 'contacts');
  setPreference('callIpProtection', 'auto');
  setActiveVoiceClient(null);
  vi.restoreAllMocks();
});

describe('dm-call-policy', () => {
  it('relays a stranger through TURN under auto, and goes direct with a contact', () => {
    contacts.list = [FRIEND];
    expect(iceTransportPolicyFor(STRANGER)).toBe('relay');
    expect(iceTransportPolicyFor(FRIEND)).toBe('all');
    setPreference('callIpProtection', 'always');
    expect(iceTransportPolicyFor(FRIEND)).toBe('relay');
    setPreference('callIpProtection', 'never');
    expect(iceTransportPolicyFor(STRANGER)).toBe('all');
  });

  it('never lets a blocked or muted contact ring, even under anyone', () => {
    contacts.list = [FRIEND];
    setPreference('callsFrom', 'anyone');
    expect(mayRing(STRANGER)).toBe(true);
    useModerationStore.setState({ blockedPubkeys: [FRIEND] });
    expect(mayRing(FRIEND)).toBe(false);
    useModerationStore.setState({ blockedPubkeys: [], mutedPubkeys: [STRANGER] });
    expect(mayRing(STRANGER)).toBe(false);
  });

  it('logs a control message that never left, naming its type', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    lost('cancel')(new Error('relay down'));
    expect(warn).toHaveBeenCalledWith('[dm-call]', 'cancel', 'not delivered', expect.any(Error));
  });

  it('hands the group call over even when its leave() rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = { leave: vi.fn(async () => { throw new Error('peer refused'); }) };
    setActiveVoiceClient(client as unknown as VoiceClient);
    await leaveGroupVoice();
    expect(client.leave).toHaveBeenCalled();
    expect(getActiveVoiceClient()).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
