/**
 * Preferences: the shape, the defaults and the normalisers that turn whatever
 * is in storage (old keys, hand-edited values, other versions) into a valid
 * `Preferences`. The store and the hook live in `preferences.ts`.
 */
import { DEFAULT_SOCIAL_RELAYS, normalizeSocialRelays } from '../social/relays';
import { DEFAULT_FEED_WIDGETS, normalizeFeedWidgets } from '../social/widgets';

export type NotificationRingtone = 'crystal' | 'marimba' | 'aurora' | 'bubble';
const RINGTONE_VALUES = new Set<NotificationRingtone>(['crystal', 'marimba', 'aurora', 'bubble']);

export type BubbleAnimationStyle = 'float' | 'drift' | 'orbit' | 'still';

/** Who may ring you for a DM call. Everyone else's invite is dropped silently. */
export type CallsFrom = 'contacts' | 'anyone';
const CALLS_FROM_VALUES = new Set<CallsFrom>(['contacts', 'anyone']);
/**
 * Whether a DM call may connect directly (which shows each side the other's
 * IP address) or must go through our TURN server.
 *   - `auto`: direct with people you follow, relayed with everyone else
 *   - `always`: always relayed
 *   - `never`: always direct
 */
export type CallIpProtection = 'auto' | 'always' | 'never';
const CALL_IP_VALUES = new Set<CallIpProtection>(['auto', 'always', 'never']);

/**
 * Relays that carry DM call negotiation. They must accept ephemeral events
 * from keys they have never seen, because the negotiation is signed by a
 * throwaway key per call - a whitelist relay (like the group relays) cannot
 * carry a call. See docs/voice/dm-calls.md.
 */
export const DEFAULT_CALL_RELAYS: readonly string[] = ['wss://relay.damus.io', 'wss://nos.lol'];
export const CALL_RELAY_MAX = 4;

export interface Preferences {
  showActivityIndicator: boolean;
  developerRelayDebug: boolean;
  directMessagesEnabled: boolean;
  postQuantumEnabled: boolean;
  /** Chime on incoming mentions, replies and DMs. */
  notificationSounds: boolean;
  /** Which ringtone chimes - ids in `src/services/notifications/sound.ts`. */
  notificationRingtone: NotificationRingtone;
  /**
   * Browser (system) notifications. On by default but inert until the
   * browser grants permission - the permission popup is raised on the
   * user's first click after login (`permission-prompt.ts`). Turning this
   * off in Preferences silences them without touching the browser grant.
   * (Renamed from `desktopNotifications`, whose off-by-default value was
   * written into every stored blob.)
   */
  browserNotifications: boolean;
  /**
   * Keep listening for mentions/replies on the last few relays the user
   * used, not just the active one. See `src/services/nostr-bridge/relay/background-watch.ts`.
   */
  backgroundRelayWatch: boolean;
  /**
   * Relays for ordinary Nostr traffic (feeds, profiles) - NOT the NIP-29
   * group relays in the rail. Formerly `profileFeedRelays`, which was capped
   * at exactly three entries; see `normalizeSocialRelays` for the migration.
   */
  socialRelays: string[];
  /**
   * Which panels the desktop feed's side column shows, in order. Two by
   * default - the column has room for about that much above the fold, and a
   * list of six is a sidebar nobody reads.
   */
  feedWidgets: string[];
  accentColor: string;
  backgroundColor: string;
  buttonColor: string;
  bubbleColor: string;
  bubbleAnimation: BubbleAnimationStyle;
  /** Relays for DM call negotiation - see {@link DEFAULT_CALL_RELAYS}. */
  callRelays: string[];
  callsFrom: CallsFrom;
  callIpProtection: CallIpProtection;
}

export const DEFAULTS: Preferences = {
  showActivityIndicator: true,
  developerRelayDebug: false,
  directMessagesEnabled: false,
  // On by default. The toggle gates both post-quantum sending *and* the two
  // provenance surfaces (the conversation notice and the per-message marks),
  // and the indicators are the feature: defaulting off meant a user saw
  // nothing at all - no notice, no marks, no guide link - so the detection
  // work was invisible to everyone who never opened settings. Sending stays
  // conservative on its own (`resolvePqSend` only seals post-quantum when the
  // signer advertises it), so this default cannot cause a false claim.
  postQuantumEnabled: true,
  notificationSounds: true,
  notificationRingtone: 'crystal',
  browserNotifications: true,
  backgroundRelayWatch: true,
  socialRelays: [...DEFAULT_SOCIAL_RELAYS],
  feedWidgets: [...DEFAULT_FEED_WIDGETS],
  accentColor: '#b4f953',
  backgroundColor: '#0a0a0a',
  buttonColor: '#b4f953',
  bubbleColor: '#b4f953',
  bubbleAnimation: 'float',
  callRelays: [...DEFAULT_CALL_RELAYS],
  callsFrom: 'contacts',
  callIpProtection: 'auto',
};

export const APPEARANCE_DEFAULTS = {
  accentColor: DEFAULTS.accentColor,
  backgroundColor: DEFAULTS.backgroundColor,
  buttonColor: DEFAULTS.buttonColor,
  bubbleColor: DEFAULTS.bubbleColor,
  bubbleAnimation: DEFAULTS.bubbleAnimation,
} as const;

const COLOR_KEYS = new Set<keyof Preferences>(['accentColor', 'backgroundColor', 'buttonColor', 'bubbleColor']);
const BUBBLE_ANIMATION_VALUES = new Set<BubbleAnimationStyle>(['float', 'drift', 'orbit', 'still']);
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

export function normalizePreferences(raw: Partial<Preferences>): Preferences {
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
      raw.socialRelays ?? (raw as { profileFeedRelays?: unknown }).profileFeedRelays,
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
    try {
      const u = new URL(entry.trim());
      if (u.protocol !== 'wss:' || u.username || u.password) continue;
      seen.add(u.toString().replace(/\/$/, ''));
    } catch {
      continue;
    }
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
