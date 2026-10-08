export type NotificationRingtone = 'crystal' | 'marimba' | 'aurora' | 'bubble';

export type BubbleAnimationStyle = 'float' | 'drift' | 'orbit' | 'still';

/** Who may ring you for a DM call. Everyone else's invite is dropped silently. */
export type CallsFrom = 'contacts' | 'anyone';

/**
 * Whether a DM call may connect directly (which shows each side the other's
 * IP address) or must go through our TURN server.
 *   - `auto`: direct with people you follow, relayed with everyone else
 *   - `always`: always relayed
 *   - `never`: always direct
 */
export type CallIpProtection = 'auto' | 'always' | 'never';

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
