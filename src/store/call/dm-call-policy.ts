/**
 * DM call policy and plumbing: who may ring us, whether a call must go
 * through TURN, sending a control message, and stepping out of a group
 * voice call before a DM call takes the microphone.
 */
import { getBridge, getBridgeImpl } from '@/services/nostr-bridge';
import { getPreferences } from '@/services/preferences/preferences';
import { useModerationStore } from '@/store/moderation';
import { useVoiceStore } from '@/store/voice';
import { getActiveVoiceClient, setActiveVoiceClient } from '@/services/voice/active-client';
import { HAS_TURN } from '@/services/voice/ice-config';
import type { DmCallMessage } from '@/services/call/protocol';
import { translate } from '@/i18n/runtime';
import type { MessageKey } from '@/i18n/keys';

export function tr(key: MessageKey): string {
  return translate(key);
}

export function send(peer: string, msg: DmCallMessage, selfNotice = false): Promise<void> {
  return getBridge().then((b) => b.sendDmCallMessage(peer, msg, { selfNotice }));
}

/**
 * For the control messages the call does not wait on. The other side has
 * a timeout for every one of them (a lost cancel rings the callee out,
 * a lost hangup ends on the connect deadline), but the user gets no sign
 * that the message never left, so the loss is at least logged.
 */
export function lost(type: DmCallMessage['type']): (err: unknown) => void {
  return (err) => console.warn('[dm-call]', type, 'not delivered', err);
}

function isContact(pubkey: string): boolean {
  const list = getBridgeImpl()?.myContactList.get();
  return Boolean(list?.tags.some((t) => t[0] === 'p' && t[1] === pubkey));
}

/** Resolve the ICE policy for a call with `peer` - see `CallIpProtection`. */
export function iceTransportPolicyFor(peer: string): RTCIceTransportPolicy {
  const mode = getPreferences().callIpProtection;
  if (mode === 'always') return 'relay';
  if (mode === 'never') return 'all';
  return !isContact(peer) && HAS_TURN ? 'relay' : 'all';
}

/** Whether `from` may ring us at all. */
export function mayRing(from: string): boolean {
  const mod = useModerationStore.getState();
  if (mod.isBlocked(from) || mod.isMuted(from)) return false;
  return getPreferences().callsFrom === 'anyone' || isContact(from);
}

/** A group voice call holds the mic; leave it before a DM call takes over. */
export async function leaveGroupVoice(): Promise<void> {
  const c = getActiveVoiceClient();
  if (!c) return;
  // The client releases its media before anything that can throw, so the
  // group call is off the air either way; the DM call goes on, and the
  // failure is reported the way the room's own Leave reports it.
  try { await c.leave(); } catch (err) {
    console.warn('[dm-call] leaving the group call failed; the DM call goes on', err);
  }
  setActiveVoiceClient(null);
  useVoiceStore.getState().leaveVoice();
}
