/**
 * The browser's own connection signals (offline, online, a tab becoming
 * visible), mirrored into the bridge's connection state. The hub's socket
 * table listens to the same events and owns the retry; these handlers only
 * reconcile the label and ask for a connect the hub is not already making.
 * Pure move from `client.ts`.
 */
import type { SessionState } from './state';

export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export class BrowserConnectionEvents {
  private wired = false;

  constructor(
    private readonly state: Pick<SessionState, 'session' | 'connectionState'>,
    private readonly retryConnectionNow: () => void,
    private readonly accountEvents?: { wire(): void; unwire(): void },
  ) {}

  private readonly onOffline = (): void => {
    if (!this.state.session) return;
    this.state.connectionState.set("Offline");
  };

  private readonly onOnline = (): void => {
    if (this.state.session) this.retryConnectionNow();
  };

  private readonly onVisibilityChange = (): void => {
    if (
      this.state.session
      && document.visibilityState === "visible"
      && this.state.connectionState.get() !== "Connected"
      && !isBrowserOffline()
    ) {
      this.retryConnectionNow();
    }
  };

  wire(): void {
    if (typeof window === "undefined" || this.wired) return;
    this.wired = true;
    this.accountEvents?.wire();
    window.addEventListener("offline", this.onOffline);
    window.addEventListener("online", this.onOnline);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  unwire(): void {
    if (typeof window === "undefined" || !this.wired) return;
    this.wired = false;
    this.accountEvents?.unwire();
    window.removeEventListener("offline", this.onOffline);
    window.removeEventListener("online", this.onOnline);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  }
}
