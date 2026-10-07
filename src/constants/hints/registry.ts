/**
 * Hints: registry. Values the code in `utils/hints/registry.ts` reads, kept
 * here so every reader imports the one copy.
 */

import type { Hint } from '@/utils/hints/registry';

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
