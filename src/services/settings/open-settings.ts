/**
 * "Take me to that setting": from anywhere, to whichever shell is mounted.
 *
 * The relay pill lives in the header; the settings panel it wants lives
 * inside `UserPanel`, which the desktop shell mounts from `SidebarMe` and
 * the phone shell from its own settings screen. Neither is an ancestor of
 * the header, so there is no prop path between them without threading a
 * callback through half the tree.
 *
 * A window event is the same shape the app already uses for cross-surface
 * nudges (`obelisk:zap-prefill`), and it keeps the pill ignorant of which
 * shell is listening.
 */

import { OPEN_SETTINGS_EVENT, RELAY_SETTINGS_ANCHOR } from '@/constants/settings/open-settings';

/**
 * Sections a caller can ask to land on: one per entry in the settings
 * sidebar (`UserPanel`). `profile` is the edit-profile form.
 */
export type SettingsSection =
  | 'profile'
  | 'general'
  | 'appearance'
  | 'notifications'
  | 'relays'
  | 'privacy'
  | 'wallet'
  | 'media'
  | 'data'
  | 'advanced';

export interface OpenSettingsDetail {
  section: SettingsSection;
}

export function openSettings(section: SettingsSection): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<OpenSettingsDetail>(OPEN_SETTINGS_EVENT, { detail: { section } }),
  );
}

/**
 * Subscribe to the request. Returns an unsubscribe, so it drops straight
 * into a `useEffect`.
 */
export function onOpenSettings(handler: (detail: OpenSettingsDetail) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<OpenSettingsDetail>).detail;
    if (detail?.section) handler(detail);
  };
  window.addEventListener(OPEN_SETTINGS_EVENT, listener);
  return () => window.removeEventListener(OPEN_SETTINGS_EVENT, listener);
}

/** Scroll the section into view once the panel that holds it has painted. */
export function revealSettingsSection(section: SettingsSection): void {
  if (typeof window === 'undefined') return;
  const id = section === 'relays' ? RELAY_SETTINGS_ANCHOR : null;
  if (!id) return;
  // Two frames: one for the panel to mount, one for its layout to settle.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  });
}
