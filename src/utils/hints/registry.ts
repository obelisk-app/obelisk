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
import { HINTS } from '@/constants/hints/registry';

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
