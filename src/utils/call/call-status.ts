import type { DmCallStatus } from '@/store/call/dm-call';
import type { MessageKey } from '@/i18n/keys';

/** The status line under the name while a call is being set up, or null once it is up. */
export function callStatusKey(status: DmCallStatus): MessageKey | null {
  if (status === 'outgoing') return 'calls.call.calling';
  if (status === 'connecting') return 'calls.call.connecting';
  if (status === 'reconnecting') return 'calls.call.reconnecting';
  return null;
}

/** Screen sharing is offered only where the browser can capture a screen. */
export function canShareScreen(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia);
}

/** A call is in progress from the first ring until it has ended. */
export function dmCallBusy(status: DmCallStatus): boolean {
  return status !== 'idle' && status !== 'ended';
}
