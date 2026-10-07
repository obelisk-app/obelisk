/**
 * DM call runtime that nobody renders: the live session, the invite being
 * answered, and the ring and linger timers. Shared by the store's actions
 * (`dm-call-store.ts`) and the inbound router (`dm-call.ts`).
 */
import type { IncomingDmCallMessage } from '@/services/call/protocol';
import type { DmCallSession } from '@/services/call/session';

export const rt: {
  session: DmCallSession | null;
  pendingInvite: IncomingDmCallMessage | null;
  ringTimer: ReturnType<typeof setTimeout> | null;
  lingerTimer: ReturnType<typeof setTimeout> | null;
  stopRing: (() => void) | null;
} = {
  session: null,
  pendingInvite: null,
  ringTimer: null,
  lingerTimer: null,
  stopRing: null,
};

export function clearRinging(): void {
  if (rt.ringTimer) clearTimeout(rt.ringTimer);
  rt.ringTimer = null;
  rt.stopRing?.();
  rt.stopRing = null;
}
