/**
 * Shared reference to the currently-active voice client.
 *
 * `chat/page.tsx` owns the lifecycle (creates on join, nulls on leave), but
 * other components — notably the persistent voice status bar in the
 * sidebar — need to toggle mute/deafen/leave without prop-drilling through
 * the component tree. Since only one voice call can be active at a time,
 * a module-scoped ref is the simplest correct shape.
 *
 * Anything with these four methods satisfies the interface — both
 * `WebSocketVoiceClient` (mesh) and `LiveKitVoiceClient` (SFU) qualify.
 */

export interface ActiveVoiceClient {
  mute(): void;
  unmute(): Promise<void>;
  setDeafened(deafened: boolean): void;
  leave(): Promise<void> | void;
  startCamera(): Promise<void>;
  stopCamera(): Promise<void>;
  startScreenShare(): Promise<void>;
  stopScreenShare(): Promise<void>;
  /**
   * Optional: re-apply current `getVoiceQuality()` settings to the live call
   * so the Settings panel can hot-apply without requiring a reload or
   * leaving and rejoining.
   */
  applyLiveQualitySettings?: () => Promise<void>;
}

let active: ActiveVoiceClient | null = null;

export function setActiveVoiceClient(client: ActiveVoiceClient | null): void {
  active = client;
}

export function getActiveVoiceClient(): ActiveVoiceClient | null {
  return active;
}
