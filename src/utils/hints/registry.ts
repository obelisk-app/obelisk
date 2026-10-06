/**
 * Everything the app explains about itself, and where.
 *
 * One entry per thing a newcomer can't be expected to guess: that a relay
 * is a community rather than a server you log into, that the feed is all of
 * Nostr rather than this relay, that your key is your account. The copy says
 * what the thing *is*; it never narrates the click.
 *
 * Hints are grouped by surface (the screen that reveals them) and ordered
 * within it. The host shows one at a time and only when its anchor is
 * actually on screen, so a hint can never point at nothing, which is what
 * lets a single registry serve both shells and lets conditional UI (voice
 * off, no relays yet, DMs not opted into) drop its own steps without a
 * condition field.
 */

import type { MessageKey } from '@/i18n/keys';

/** The screen a hint belongs to. Matches the mobile nav ids where they overlap. */
export type SurfaceId =
  | 'server'            // relay rail + channel list
  | 'channel'           // a conversation
  | 'feed'
  | 'dms-list'
  | 'inbox'
  | 'settings-profile'
  | 'voice';

export type Shell = 'desktop' | 'mobile';

export type Hint = {
  /** Stable id: persisted in the seen-set, so renaming one re-shows it. */
  id: string;
  surface: SurfaceId;
  /** The `data-tour` value on the control this explains. */
  anchor: string;
  titleKey: MessageKey;
  bodyKey: MessageKey;
  /** Omitted = both shells. */
  shell?: Shell;
  /** Ascending, within a surface. */
  order: number;
};

/**
 * Anchors live on the real controls as `data-tour="<anchor>"`.
 *
 * Deliberately not `data-testid`: a test id is free to change with a test,
 * and product behaviour shouldn't move when it does.
 */
export const HINTS: readonly Hint[] = [
  // ── The rail and the channel list ────────────────────────────────
  {
    id: 'rail-relay',
    surface: 'server',
    anchor: 'rail-relay',
    titleKey: 'shell.hints.railRelay.title',
    bodyKey: 'shell.hints.railRelay.body',
    order: 10,
  },
  {
    id: 'rail-add',
    surface: 'server',
    anchor: 'rail-add-relay',
    titleKey: 'shell.hints.railAdd.title',
    bodyKey: 'shell.hints.railAdd.body',
    order: 20,
  },
  {
    id: 'channels',
    surface: 'server',
    anchor: 'channels-list',
    titleKey: 'shell.hints.channels.title',
    bodyKey: 'shell.hints.channels.body',
    order: 30,
  },
  {
    id: 'rail-feed',
    surface: 'server',
    anchor: 'rail-feed',
    titleKey: 'shell.hints.railFeed.title',
    bodyKey: 'shell.hints.railFeed.body',
    shell: 'desktop',
    order: 40,
  },
  {
    id: 'rail-dm',
    surface: 'server',
    anchor: 'rail-dm',
    titleKey: 'shell.hints.railDm.title',
    bodyKey: 'shell.hints.railDm.body',
    shell: 'desktop',
    order: 50,
  },

  // ── A conversation ───────────────────────────────────────────────
  {
    id: 'composer',
    surface: 'channel',
    anchor: 'composer',
    titleKey: 'shell.hints.composer.title',
    bodyKey: 'shell.hints.composer.body',
    order: 10,
  },

  // ── The feed ─────────────────────────────────────────────────────
  {
    id: 'feed-source',
    surface: 'feed',
    anchor: 'feed-source',
    titleKey: 'shell.hints.feedSource.title',
    bodyKey: 'shell.hints.feedSource.body',
    order: 10,
  },
  {
    id: 'feed-search',
    surface: 'feed',
    anchor: 'feed-search',
    titleKey: 'shell.hints.feedSearch.title',
    bodyKey: 'shell.hints.feedSearch.body',
    order: 20,
  },
  {
    id: 'feed-compose',
    surface: 'feed',
    anchor: 'feed-compose',
    titleKey: 'shell.hints.feedCompose.title',
    bodyKey: 'shell.hints.feedCompose.body',
    order: 30,
  },

  // ── DMs ──────────────────────────────────────────────────────────
  {
    id: 'dms',
    surface: 'dms-list',
    anchor: 'dm-list',
    titleKey: 'shell.hints.dms.title',
    bodyKey: 'shell.hints.dms.body',
    order: 10,
  },

  // ── Inbox ────────────────────────────────────────────────────────
  {
    id: 'inbox',
    surface: 'inbox',
    anchor: 'inbox-tabs',
    titleKey: 'shell.hints.inbox.title',
    bodyKey: 'shell.hints.inbox.body',
    order: 10,
  },

  // ── Voice ────────────────────────────────────────────────────────
  {
    id: 'voice',
    surface: 'voice',
    anchor: 'voice-join',
    titleKey: 'shell.hints.voice.title',
    bodyKey: 'shell.hints.voice.body',
    order: 10,
  },

  // ── You ──────────────────────────────────────────────────────────
  {
    id: 'identity',
    surface: 'settings-profile',
    anchor: 'profile-button',
    titleKey: 'shell.hints.identity.title',
    bodyKey: 'shell.hints.identity.body',
    order: 10,
  },
  {
    id: 'relay-status',
    surface: 'settings-profile',
    anchor: 'relay-status',
    titleKey: 'shell.hints.relayStatus.title',
    bodyKey: 'shell.hints.relayStatus.body',
    order: 20,
  },
];

/** Hints for a surface, in order, for this shell. */
export function hintsForSurface(surface: SurfaceId, shell: Shell): Hint[] {
  return HINTS
    .filter((hint) => hint.surface === surface && (!hint.shell || hint.shell === shell))
    .sort((a, b) => a.order - b.order);
}

/** The hint an anchor belongs to, for "using the control counts as learning it". */
export function hintForAnchor(anchor: string): Hint | undefined {
  return HINTS.find((hint) => hint.anchor === anchor);
}
