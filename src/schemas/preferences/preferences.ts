import type { NotificationRingtone, BubbleAnimationStyle, CallsFrom, CallIpProtection, Preferences } from '@/types/preferences/preferences';
import { parseRelayUrl } from '@nostr-wot/relay';
/**
 * Runtime validation of persisted preferences (old keys, hand-edited values
 * and other versions). Loading and saving belong to the preferences service.
 */
import { normalizeSocialRelays } from '@/utils/social/relays';
import { normalizeFeedWidgets } from '@/utils/social/widgets';
import { DEFAULT_CALL_RELAYS, CALL_RELAY_MAX, DEFAULTS } from '@/constants/preferences/defaults';
const RINGTONE_VALUES = new Set<NotificationRingtone>(['crystal', 'marimba', 'aurora', 'bubble']);
const CALLS_FROM_VALUES = new Set<CallsFrom>(['contacts', 'anyone']);
const CALL_IP_VALUES = new Set<CallIpProtection>(['auto', 'always', 'never']);

const COLOR_KEYS = new Set<keyof Preferences>(['accentColor', 'backgroundColor', 'buttonColor', 'bubbleColor']);
const BUBBLE_ANIMATION_VALUES = new Set<BubbleAnimationStyle>(['float', 'drift', 'orbit', 'still']);
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

export function normalizePreferences(value: unknown): Preferences {
  const raw: Record<string, unknown> = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  return {
    showActivityIndicator: typeof raw.showActivityIndicator === 'boolean'
      ? raw.showActivityIndicator
      : DEFAULTS.showActivityIndicator,
    developerRelayDebug: typeof raw.developerRelayDebug === 'boolean'
      ? raw.developerRelayDebug
      : DEFAULTS.developerRelayDebug,
    directMessagesEnabled: typeof raw.directMessagesEnabled === 'boolean'
      ? raw.directMessagesEnabled
      : DEFAULTS.directMessagesEnabled,
    postQuantumEnabled: typeof raw.postQuantumEnabled === 'boolean'
      ? raw.postQuantumEnabled
      : DEFAULTS.postQuantumEnabled,
    notificationSounds: typeof raw.notificationSounds === 'boolean'
      ? raw.notificationSounds
      : DEFAULTS.notificationSounds,
    notificationRingtone: normalizeRingtone(raw.notificationRingtone),
    browserNotifications: typeof raw.browserNotifications === 'boolean'
      ? raw.browserNotifications
      : DEFAULTS.browserNotifications,
    backgroundRelayWatch: typeof raw.backgroundRelayWatch === 'boolean'
      ? raw.backgroundRelayWatch
      : DEFAULTS.backgroundRelayWatch,
    // Migration: the old key held exactly three relays. Any stored value is
    // a valid input to the new normalizer, so this is lossless - read the
    // legacy key when the new one is absent.
    socialRelays: normalizeSocialRelays(
      raw.socialRelays ?? raw.profileFeedRelays,
    ),
    feedWidgets: normalizeFeedWidgets(raw.feedWidgets),
    accentColor: sanitizeHexColor(raw.accentColor, DEFAULTS.accentColor),
    backgroundColor: sanitizeHexColor(raw.backgroundColor, DEFAULTS.backgroundColor),
    buttonColor: sanitizeHexColor(raw.buttonColor, DEFAULTS.buttonColor),
    bubbleColor: sanitizeHexColor(raw.bubbleColor, DEFAULTS.bubbleColor),
    bubbleAnimation: normalizeBubbleAnimation(raw.bubbleAnimation),
    callRelays: normalizeCallRelays(raw.callRelays),
    callsFrom: CALLS_FROM_VALUES.has(raw.callsFrom as CallsFrom) ? raw.callsFrom as CallsFrom : DEFAULTS.callsFrom,
    callIpProtection: CALL_IP_VALUES.has(raw.callIpProtection as CallIpProtection)
      ? raw.callIpProtection as CallIpProtection
      : DEFAULTS.callIpProtection,
  };
}

/** Deduped wss URLs, capped; an empty or invalid list falls back to the defaults. */
export function normalizeCallRelays(value: unknown): string[] {
  const input = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  for (const entry of input) {
    if (typeof entry !== 'string') continue;
    const url = parseRelayUrl(entry);
    if (!url) continue;
    seen.add(url.toString().replace(/\/$/, ''));
    if (seen.size >= CALL_RELAY_MAX) break;
  }
  return seen.size > 0 ? [...seen] : [...DEFAULT_CALL_RELAYS];
}

export function normalizePreferenceValue<K extends keyof Preferences>(key: K, value: Preferences[K]): Preferences[K] {
  if (key === 'socialRelays') {
    return normalizeSocialRelays(value) as Preferences[K];
  }
  if (key === 'notificationRingtone') {
    return normalizeRingtone(value) as Preferences[K];
  }
  if (key === 'bubbleAnimation') {
    return normalizeBubbleAnimation(value) as Preferences[K];
  }
  if (key === 'feedWidgets') {
    return normalizeFeedWidgets(value) as Preferences[K];
  }
  if (key === 'callRelays') {
    return normalizeCallRelays(value) as Preferences[K];
  }
  if (!COLOR_KEYS.has(key)) return value;
  const fallback = DEFAULTS[key] as string;
  return sanitizeHexColor(value, fallback) as Preferences[K];
}

export function sanitizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return HEX_COLOR_RE.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

function normalizeRingtone(value: unknown): NotificationRingtone {
  return RINGTONE_VALUES.has(value as NotificationRingtone)
    ? value as NotificationRingtone
    : DEFAULTS.notificationRingtone;
}

function normalizeBubbleAnimation(value: unknown): BubbleAnimationStyle {
  return BUBBLE_ANIMATION_VALUES.has(value as BubbleAnimationStyle)
    ? value as BubbleAnimationStyle
    : DEFAULTS.bubbleAnimation;
}
