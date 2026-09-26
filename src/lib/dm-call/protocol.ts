/**
 * DM call control messages — what rides inside a gift-wrapped
 * `KIND_DM_CALL_RUMOR` rumor.
 *
 * The invite is the only message that says anything about the call itself:
 * which throwaway key the caller will speak with, which relays the WebRTC
 * negotiation will use, and whether it starts with video. The callee's
 * `accept` answers with its own throwaway key. Everything after that happens
 * on those relays between those two keys, so the relay carrying the call
 * never sees either real npub.
 *
 * Control messages are only worth anything live. A rumor's `created_at` is
 * not fuzzed (only the seal's and the wrap's are), so it is an honest clock:
 * anything older than {@link CALL_MESSAGE_MAX_AGE_S} is dropped, which is
 * also what keeps a reconnect's backlog from ringing you for yesterday.
 */

export type DmCallMessageType = 'invite' | 'accept' | 'decline' | 'cancel' | 'hangup' | 'busy';

export interface DmCallMessage {
  readonly type: DmCallMessageType;
  /** 32 random bytes, hex. Names the call; never on the wire in the clear. */
  readonly callId: string;
  /** Throwaway pubkey the sender negotiates with (invite / accept). */
  readonly eph?: string;
  /** Relays the negotiation runs on (invite only). */
  readonly relays?: readonly string[];
  /** Whether the caller starts with camera on (invite only). */
  readonly video?: boolean;
}

/** Received control message: the parsed body plus who sent it and when. */
export interface IncomingDmCallMessage extends DmCallMessage {
  /** Real sender, recovered from the seal — never the rumor's own `pubkey`. */
  readonly from: string;
  /** Rumor `created_at`, seconds. */
  readonly sentAt: number;
}

/** How old a control message may be and still count. */
export const CALL_MESSAGE_MAX_AGE_S = 60;
/** How long an invite rings before the caller gives up. */
export const CALL_RING_TIMEOUT_MS = 45_000;
export const MAX_CALL_RELAYS = 4;

const HEX64 = /^[0-9a-f]{64}$/;
const TYPES = new Set<DmCallMessageType>(['invite', 'accept', 'decline', 'cancel', 'hangup', 'busy']);

function isRelayUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return (u.protocol === 'wss:' || u.protocol === 'ws:') && !u.username && !u.password;
  } catch {
    return false;
  }
}

export function encodeDmCallMessage(msg: DmCallMessage): string {
  return JSON.stringify({ v: 1, ...msg });
}

/**
 * Parse and validate a control rumor's content. Returns null for anything
 * malformed. Relay URLs are checked here because the callee connects to them.
 */
export function parseDmCallMessage(content: string): DmCallMessage | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const type = raw.type as DmCallMessageType;
  if (!TYPES.has(type)) return null;
  const callId = typeof raw.callId === 'string' ? raw.callId.toLowerCase() : '';
  if (!HEX64.test(callId)) return null;
  const eph = typeof raw.eph === 'string' ? raw.eph.toLowerCase() : undefined;
  if ((type === 'invite' || type === 'accept') && (!eph || !HEX64.test(eph))) return null;
  let relays: string[] | undefined;
  if (type === 'invite') {
    if (!Array.isArray(raw.relays)) return null;
    relays = [...new Set(raw.relays.filter(isRelayUrl))].slice(0, MAX_CALL_RELAYS);
    if (relays.length === 0) return null;
  }
  return {
    type,
    callId,
    ...(eph ? { eph } : {}),
    ...(relays ? { relays } : {}),
    ...(type === 'invite' ? { video: raw.video === true } : {}),
  };
}

export function isFreshCallMessage(sentAtSeconds: number, nowMs = Date.now()): boolean {
  const age = nowMs / 1000 - sentAtSeconds;
  // A little tolerance for a sender whose clock runs ahead.
  return age <= CALL_MESSAGE_MAX_AGE_S && age >= -30;
}

export function newCallId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
