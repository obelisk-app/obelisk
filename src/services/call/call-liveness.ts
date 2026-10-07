/**
 * When a DM call gives up: the connect deadline for a call that never came
 * up, the reconnect window for one that dropped, and the caller's rebuild
 * budget. Owned by `DmCallSession`; it only keeps time, the session decides.
 */
import { CONNECT_DEADLINE_MS, MAX_REBUILDS, RECONNECT_GIVE_UP_MS } from '@/constants/call/session-config';

export class CallLiveness {
  everConnected = false;
  private rebuilds = 0;
  private connectDeadline: ReturnType<typeof setTimeout> | null = null;
  private giveUpTimer: ReturnType<typeof setTimeout> | null = null;

  /** Start the connect deadline once, unless the call has connected before. */
  armConnectDeadline(onExpire: () => void): void {
    if (this.connectDeadline || this.everConnected) return;
    this.connectDeadline = setTimeout(() => {
      if (!this.everConnected) onExpire();
    }, CONNECT_DEADLINE_MS);
  }

  /** Media is flowing: reset the rebuild budget and stop both clocks. */
  connected(): void {
    this.everConnected = true;
    this.rebuilds = 0;
    if (this.connectDeadline) {
      clearTimeout(this.connectDeadline);
      this.connectDeadline = null;
    }
    if (this.giveUpTimer) {
      clearTimeout(this.giveUpTimer);
      this.giveUpTimer = null;
    }
  }

  /** A connected call dropped: start the reconnect window, once. */
  armGiveUp(onExpire: () => void): void {
    if (!this.giveUpTimer) this.giveUpTimer = setTimeout(onExpire, RECONNECT_GIVE_UP_MS);
  }

  /** Count one caller rebuild. True when a never-connected call is out of budget. */
  rebuildExhausted(): boolean {
    this.rebuilds++;
    return !this.everConnected && this.rebuilds > MAX_REBUILDS;
  }

  stop(): void {
    if (this.giveUpTimer) clearTimeout(this.giveUpTimer);
    if (this.connectDeadline) clearTimeout(this.connectDeadline);
  }
}
