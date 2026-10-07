/**
 * What the voice room shows around its stage: the channel's name, the
 * pre-join head count, and whether the developer overlay is on. Pure.
 */
import type { ActiveCallInfo } from '@/services/nostr-bridge';

/** The channel's name, or the first 16 characters of its id. */
export function voiceRoomDisplayName(channelName: string | undefined, channelId: string): string {
  return channelName ?? `${channelId.slice(0, 16)}…`;
}

/**
 * How many people the pre-join landing says are in the call: the larger of
 * the SFU's count (ignored while unknown, -1, or empty, 0) and the faces
 * the detector has seen. No call, nobody.
 */
export function passiveCallCount(activeCall: Pick<ActiveCallInfo, 'participantCount' | 'participantPubkeys'> | null): number {
  if (!activeCall) return 0;
  return Math.max(activeCall.participantCount > 0 ? activeCall.participantCount : 0, activeCall.participantPubkeys?.length ?? 0);
}

/** `?debug=voice` turns on the mesh diagnostics overlay. */
export function isVoiceDebugOn(search: string): boolean {
  return new URLSearchParams(search).get('debug') === 'voice';
}
