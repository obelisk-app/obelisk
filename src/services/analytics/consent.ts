/**
 * The person's answer to "may Obelisk use Google Analytics?", and what it
 * switches on or off.
 *
 * - No answer yet: the banner asks (`AnalyticsConsentRoot`), and nothing
 *   from Google loads.
 * - `granted`: gtag.js loads (`gtag.ts`), on this page and every later one.
 * - `denied`: nothing from Google loads. Changing to `denied` on a page
 *   where gtag.js already runs sets Google's opt-out flag and deletes the
 *   `_ga*` cookies, without a reload.
 *
 * The answer is one localStorage key (`ANALYTICS_CONSENT_KEY`, listed in the
 * local-data inventory under `analytics`). It can be changed in Settings >
 * Data on this device and from the link in the marketing footer, both of
 * which reopen or drive this module. Another tab's change arrives through
 * the `storage` event and is applied here too.
 */
import { startAnalytics, stopAnalytics } from './gtag';

export type AnalyticsChoice = 'granted' | 'denied';

export const ANALYTICS_CONSENT_KEY = 'obelisk:analytics-consent';

export interface AnalyticsConsentState {
  /** `false` until read from this browser (always `false` on the server). */
  readonly known: boolean;
  /** The stored answer, or `null` when the person has not answered. */
  readonly choice: AnalyticsChoice | null;
  /** The person asked to see the question again (footer link). */
  readonly reviewing: boolean;
}

/** What the server renders and hydration starts from: nothing shown. */
export const UNKNOWN_CONSENT: AnalyticsConsentState = Object.freeze({ known: false, choice: null, reviewing: false });

let state: AnalyticsConsentState = UNKNOWN_CONSENT;
const listeners = new Set<() => void>();

function parse(raw: string | null): AnalyticsChoice | null {
  return raw === 'granted' || raw === 'denied' ? raw : null;
}

function readStored(): AnalyticsChoice | null {
  try {
    return parse(localStorage.getItem(ANALYTICS_CONSENT_KEY));
  } catch {
    return null;
  }
}

function writeStored(choice: AnalyticsChoice | null): void {
  try {
    if (choice) localStorage.setItem(ANALYTICS_CONSENT_KEY, choice);
    else localStorage.removeItem(ANALYTICS_CONSENT_KEY);
  } catch { /* private mode or full: the answer holds for this visit */ }
}

function update(next: Partial<AnalyticsConsentState>): void {
  state = { ...state, known: true, ...next };
  listeners.forEach((l) => l());
}

/** Turn gtag.js on or off to match an answer. No answer means off. */
function apply(choice: AnalyticsChoice | null): void {
  if (typeof window === 'undefined') return;
  if (choice === 'granted') startAnalytics();
  else stopAnalytics();
}

/** The current state; reads this browser's answer on first use. */
export function getAnalyticsConsent(): AnalyticsConsentState {
  if (!state.known && typeof window !== 'undefined') {
    state = { known: true, choice: readStored(), reviewing: false };
  }
  return state;
}

/**
 * Called once per page by the root component: load gtag.js when the stored
 * answer is "allow". Otherwise nothing from Google loads, and any `_ga*`
 * cookie still here is deleted: builds before the question loaded
 * Analytics on every page, so a returning visitor may carry one.
 */
export function applyStoredAnalyticsConsent(): void {
  apply(getAnalyticsConsent().choice);
}

/** Save the person's answer and act on it at once; closes the question. */
export function setAnalyticsConsent(choice: AnalyticsChoice): void {
  writeStored(choice);
  update({ choice, reviewing: false });
  apply(choice);
}

/**
 * Forget the answer (Settings > Data on this device, removing the
 * Analytics category): Analytics stops, its cookies go, and the question is
 * asked again.
 */
export function forgetAnalyticsConsent(): void {
  writeStored(null);
  update({ choice: null, reviewing: false });
  apply(null);
}

/** Show the question again (the footer link). */
export function reviewAnalyticsConsent(): void {
  getAnalyticsConsent();
  update({ reviewing: true });
}

function onStorage(event: StorageEvent): void {
  if (event.key !== ANALYTICS_CONSENT_KEY && event.key !== null) return;
  const choice = readStored();
  if (choice === state.choice) return;
  update({ choice });
  apply(choice);
}

/** Change listener; the first one also listens for other tabs. Returns an unsubscribe. */
export function subscribeAnalyticsConsent(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

/** @internal Tests: forget the in-memory state so the next read goes to storage. */
export function _resetAnalyticsConsentForTest(): void {
  state = UNKNOWN_CONSENT;
  listeners.forEach((l) => l());
}
