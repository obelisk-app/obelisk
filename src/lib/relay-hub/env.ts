import type { HubEnv } from './types';

/** Browser defaults; every field is overridable so tests inject fake time, randomness and visibility. */
export function defaultEnv(overrides?: Partial<HubEnv>): HubEnv {
  const base: HubEnv = {
    now: () => Date.now(),
    random: () => Math.random(),
    isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
    isHidden: () => (typeof document === 'undefined' ? false : document.visibilityState === 'hidden'),
    events: typeof window === 'undefined' ? null : window,
  };
  return { ...base, ...overrides };
}

export class HubError extends Error {
  constructor(message: string, readonly code: 'unknown-identity' | 'socket-budget' | 'invalid-url' | 'disposed') {
    super(message);
    this.name = 'RelayHubError';
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : String(err);
}

export const PRIORITY_RANK: Record<'voice' | 'active' | 'dm' | 'background', number> = {
  voice: 3,
  active: 2,
  dm: 1,
  background: 0,
};

/**
 * How much longer than the hub's own deadline (a watchdog, a query's
 * `maxWait`) nostr-tools may wait before its synthetic EOSE. Keeping the
 * library's timer behind ours means only a relay-sent EOSE can prove a REQ
 * empty; a silent timeout stays a timeout.
 */
export const SYNTHETIC_EOSE_MARGIN_MS = 1000;

/** nostr-tools' ephemeral range. */
export function isEphemeralKind(kind: number): boolean {
  return kind >= 20000 && kind < 30000;
}
