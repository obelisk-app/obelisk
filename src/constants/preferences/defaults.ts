/**
 * Default preferences and validation limits. Values the code in
 * `services/preferences/preferences-schema.ts` reads, kept here so every
 * reader imports the one copy.
 */

import { DEFAULT_SOCIAL_RELAYS } from '@/constants/social/relays';
import { DEFAULT_FEED_WIDGETS } from '@/constants/social/widgets';
import type { Preferences } from '@/types/preferences/preferences';

/**
 * Relays that carry DM call negotiation. They must accept ephemeral events
 * from keys they have never seen, because the negotiation is signed by a
 * throwaway key per call - a whitelist relay (like the group relays) cannot
 * carry a call. See docs/features/voice/dm-calls.md.
 */
export const DEFAULT_CALL_RELAYS: readonly string[] = ['wss://relay.damus.io', 'wss://nos.lol'];

export const CALL_RELAY_MAX = 4;

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
