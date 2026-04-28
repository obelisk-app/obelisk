// src/lib/notifications/permission.ts
// Browser Notification permission state machine + soft-prompt eligibility.
// We never call Notification.requestPermission() automatically — only on
// explicit user click — because browsers penalize sites that auto-prompt
// and once denied recovery requires the user to find the site settings.

const PERMA_DISMISS_KEY = 'obelisk:notif-prompt-dismissed';

export type PermissionState = 'unsupported' | NotificationPermission;

export function readPermission(): PermissionState {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestPermission(): Promise<PermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.requestPermission();
}

export function isPermanentlyDismissed(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(PERMA_DISMISS_KEY) === 'true';
}

export function setPermanentlyDismissed(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(PERMA_DISMISS_KEY, 'true');
}

export interface SoftPromptInput {
  permission: PermissionState;
  sessionStartedAt: number;
  now: number;
  sessionDismissed: boolean;
  permanentlyDismissed: boolean;
}

export function isSoftPromptEligible(i: SoftPromptInput): boolean {
  if (i.permission !== 'default') return false;
  if (i.now - i.sessionStartedAt < 60_000) return false;
  if (i.sessionDismissed) return false;
  if (i.permanentlyDismissed) return false;
  return true;
}
