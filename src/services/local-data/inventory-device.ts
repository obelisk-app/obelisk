/**
 * Inventory, part 2: what this device decided or holds for the person
 * (preferences, mutes and stickers, the login, offline files, language).
 * Unlike the caches, some of it exists nowhere else.
 */
import { VAULT_DB } from '@/lib/crypto/session-vault';
import { GA_COOKIE, GA_COOKIE_PREFIX } from '@/services/analytics/gtag';
import type { LocalDataEntry } from './types';

const LS = 'localStorage' as const;
const SS = 'sessionStorage' as const;

/** One small preference or layout key: device-wide, not sensitive. */
function pref(id: string, key: string, match: 'exact' | 'prefix', holds: string, source: string, legacy = false): LocalDataEntry {
  return {
    id, area: LS, key, match, category: 'preferences', holds,
    why: 'Remembers a choice or a layout; without it the default comes back.',
    perAccount: false, sensitive: false, legacy, source,
  };
}

export const DEVICE_ENTRIES: ReadonlyArray<LocalDataEntry> = [
  // ---- preferences and layout ---------------------------------------------
  pref('preferences', 'obelisk:preferences', 'exact', 'App settings: sounds, notifications, feed, call and social relays, DM opt-in, post-quantum, appearance.', 'src/services/preferences/preferences.ts'),
  pref('remote-media', 'obelisk:remote-media', 'exact', 'Whether to load images and embeds from other servers.', 'src/services/media/remote-media.ts'),
  pref('voice-quality', 'obelisk:voice:quality', 'exact', 'Voice and video quality choice.', 'src/store/voice/index.ts'),
  pref('wot', 'obelisk:wot', 'exact', 'Web of trust on or off, hops and minimum paths.', 'src/services/wot/store.ts'),
  pref('hints', 'obelisk:hints:', 'prefix', 'Which tips this account has seen, or that tips are off.', 'src/store/hints/index.ts'),
  pref('hints-base', 'obelisk:hints', 'exact', 'The unscoped key of the hints store.', 'src/store/common/multi-account.ts'),
  pref('sidebar-width', 'obelisk-dex/sidebar-width', 'exact', 'Desktop channel sidebar width.', 'src/utils/shell/desktop/desktop-layout.ts'),
  pref('profile-pane-width', 'obelisk-dex/profile-pane-width', 'exact', 'Desktop profile pane width.', 'src/utils/shell/desktop/desktop-layout.ts'),
  pref('thread-pane-width', 'obelisk-dex/thread-pane-width', 'exact', 'Desktop thread pane width.', 'src/utils/shell/desktop/desktop-layout.ts'),
  pref('feed-pane-width', 'obelisk-dex/feed-pane-width', 'exact', 'Desktop feed pane width.', 'src/utils/shell/desktop/desktop-layout.ts'),
  pref('show-members', 'obelisk-dex/show-members', 'exact', 'Whether the desktop member list is open.', 'src/utils/shell/desktop/desktop-layout.ts'),
  pref('voice-chat-width', 'obelisk:voice-chat-width', 'exact', 'Width of the chat rail beside a voice room.', 'src/hooks/shell/panes/channel/useVoiceChatPane.ts'),
  pref('forum-collapsed', 'obelisk-dex/forum-collapsed/', 'prefix', 'Collapsed publication groups in the sidebar, per group.', 'src/hooks/shell/mobile/screens/server/useForumCollapsed.ts'),
  pref('forum-prefs', 'obelisk-dex/forum-prefs/', 'prefix', 'Sort and view choice per publication.', 'src/services/chat/forum/forum-prefs.ts'),
  pref('forum-prefs-mobile', 'obelisk-dex/forum-prefs-mobile/', 'prefix', 'Sort and view choice per publication on the phone.', 'src/services/chat/forum/forum-prefs.ts'),
  pref('recent-emojis', 'obelisk:recent-emojis', 'exact', 'Recently used emoji.', 'src/services/chat/picker/recent-emojis.ts'),
  pref('recent-media', 'obelisk:recent-media', 'exact', 'Recently used GIFs and stickers.', 'src/services/chat/picker/recent-media.ts'),
  pref('recent-slash-commands', 'obelisk:recent-slash-commands', 'exact', 'Recently used slash commands.', 'src/services/chat/slash/recent-slash-commands.ts'),
  pref('search-history', 'obelisk-dex/search-history', 'exact', 'Recent relay searches.', 'src/hooks/chat/search/search-history.ts'),
  pref('stacker-audio', 'obelisk-dex/stacker/audio', 'exact', 'Stacker game sound and music switches.', 'src/lib/games/stacker/audio.ts'),
  pref('stacker-keys', 'obelisk-dex/stacker/keys', 'exact', 'Stacker game key bindings.', 'src/lib/games/stacker/keymap.ts'),
  pref('claimed-admin', 'obelisk:claimed-admin:', 'prefix', 'Groups where this account already claimed creator admin rights, per relay.', 'src/hooks/shell/panes/channel/useChannelPanelState.ts'),
  pref('mobile-setup-seen', 'obelisk-dex/mobile-setup-seen/', 'prefix', 'An old "phone tutorial seen" flag.', 'src/services/local-data/cache-clear.ts', true),
  pref('just-generated', 'obelisk-dex/just-generated/', 'prefix', 'An old "key just generated" flag.', 'src/services/local-data/cache-clear.ts', true),
  pref('forum-follow', 'obelisk-forum-follow', 'prefix', 'An old per-account publication follow store.', 'src/services/local-data/cache-clear.ts', true),
  pref('followed-migrated', 'obelisk:followed-migrated', 'exact', 'An old migration flag.', 'src/services/common/reset.ts', true),
  pref('followed-posts', 'obelisk:followed-posts', 'exact', 'An old followed-posts list.', 'src/services/common/reset.ts', true),
  // ---- mutes, blocks, channel choices and saved stickers -------------------
  {
    id: 'moderation', area: LS, key: 'obelisk:moderation:', match: 'prefix', category: 'personal',
    holds: 'People muted or blocked from this device (the published kind 10000 mute list is separate and lives on relays).',
    why: 'Their messages stay hidden. Exists only here.', perAccount: true, sensitive: true, source: 'src/store/moderation/index.ts',
  },
  {
    id: 'moderation-base', area: LS, key: 'obelisk:moderation', match: 'exact', category: 'personal',
    holds: 'The unscoped key of the moderation store.', why: 'See read-state-base.',
    perAccount: false, sensitive: false, source: 'src/store/common/multi-account.ts',
  },
  {
    id: 'channel-prefs', area: LS, key: 'obelisk-channel-prefs:', match: 'prefix', category: 'personal',
    holds: 'Per channel: followed or not, muted until when, which messages ping.',
    why: 'The channel menu choices. Exists only here.', perAccount: true, sensitive: false, source: 'src/store/chat/channel-prefs.ts',
  },
  {
    id: 'channel-prefs-base', area: LS, key: 'obelisk-channel-prefs', match: 'exact', category: 'personal',
    holds: 'The unscoped key of the channel-prefs store.', why: 'See read-state-base.',
    perAccount: false, sensitive: false, source: 'src/store/common/multi-account.ts',
  },
  {
    id: 'personal-stickers', area: LS, key: 'obelisk:personal-stickers', match: 'exact', category: 'personal',
    holds: 'Name to URL of stickers saved from chat (the images stay on their file servers).',
    why: 'The "saved" tab of the sticker picker. Exists only here.', perAccount: false, sensitive: false, source: 'src/services/chat/picker/personal-stickers.ts',
  },
  // ---- the login ----------------------------------------------------------
  {
    id: 'session', area: LS, key: 'obelisk-dex/session', match: 'exact', category: 'login',
    holds: 'Public key, login method, active relay, and for nsec and bunker logins the secrets as an AES-GCM box.',
    why: 'Stays logged in across reloads.', perAccount: false, sensitive: true, source: 'src/services/nostr-bridge/session/persistence.ts',
  },
  {
    id: 'relays', area: LS, key: 'obelisk-dex/relays', match: 'exact', category: 'login',
    holds: 'The relay rail: the group relays added.', why: 'The rail survives a reload.',
    perAccount: false, sensitive: true, source: 'src/services/nostr-bridge/session/relays.ts',
  },
  {
    id: 'vault', area: 'indexedDB', key: VAULT_DB, match: 'exact', category: 'login',
    holds: 'One non-extractable AES-GCM key that seals the session secrets.',
    why: 'Keeps the nsec and bunker secrets off disk in the clear.', perAccount: false, sensitive: true, source: 'src/lib/crypto/session-vault.ts',
  },
  {
    id: 'session-legacy', area: LS, key: 'obeliskord/session', match: 'exact', category: 'login',
    holds: 'The session record under the pre-rename key; migrated on load.', why: 'None any more.',
    perAccount: false, sensitive: true, legacy: true, source: 'src/services/nostr-bridge/session/session-storage.ts',
  },
  {
    id: 'relays-legacy', area: LS, key: 'obeliskord/relays', match: 'exact', category: 'login',
    holds: 'The relay rail under the pre-rename key; migrated on load.', why: 'None any more.',
    perAccount: false, sensitive: false, legacy: true, source: 'src/services/nostr-bridge/session/session-storage.ts',
  },
  {
    id: 'sdk-signer', area: LS, key: '@nostr-wot/ui:', match: 'prefix', category: 'login',
    holds: 'The SDK login widget\'s plaintext NIP-46 pairing and remembered nsec, from before it ran on memory-only storage.',
    why: 'None: erased on every load and logout.', perAccount: false, sensitive: true, legacy: true, source: 'src/services/nostr-bridge/session/vault.ts',
  },
  {
    id: 'auth-in-progress', area: LS, key: 'obelisk-auth-in-progress', match: 'exact', category: 'login',
    holds: 'An old "login in progress" flag.', why: 'None any more.',
    perAccount: false, sensitive: false, legacy: true, source: 'src/services/common/reset.ts',
  },
  {
    id: 'session-tab', area: SS, key: 'obelisk-dex/session', match: 'exact', category: 'login',
    holds: 'A per-tab session record an old version kept; still read as a fallback by the landing page.',
    why: 'None any more.', perAccount: false, sensitive: true, legacy: true, source: 'src/hooks/marketing/useSavedAccount.ts',
  },
  {
    id: 'session-tab-legacy', area: SS, key: 'obeliskord/session', match: 'exact', category: 'login',
    holds: 'The same, under the pre-rename key.', why: 'None any more.',
    perAccount: false, sensitive: true, legacy: true, source: 'src/hooks/marketing/useSavedAccount.ts',
  },
  // ---- direct messages, encrypted -------------------------------------------
  {
    id: 'dm-archive', area: 'indexedDB', key: 'obelisk-dms', match: 'exact', category: 'dmMessages',
    holds: 'Per account: the DM key, NIP-44 wrapped to the user\'s own pubkey by their signer (an unsigned kind 30078 kept only here), and one AES-256-GCM box per opened DM, keyed by its wire id.',
    why: 'Opened DMs come back on a reload with one signer call (the key), not two per gift wrap.', perAccount: true, sensitive: true, source: 'src/services/nostr-bridge/dm/store-db.ts',
  },
  // ---- the wallet connection ----------------------------------------------
  {
    id: 'nwc-wallet', area: LS, key: 'obelisk-dex/nwc:', match: 'prefix', category: 'wallet',
    holds: 'The Nostr Wallet Connect link (its client secret is a spending credential) and the wallet alias, sealed with the vault\'s separate `wallet-key`.',
    why: 'Zaps and invoice payments keep working after a reload without pasting the link again.',
    perAccount: true, sensitive: true, source: 'src/services/wallet/nwc-storage.ts',
  },
  // ---- offline app files --------------------------------------------------
  {
    id: 'sw-caches', area: 'cacheStorage', key: 'obelisk-v', match: 'prefix', category: 'offline',
    holds: 'The service worker\'s caches: hashed static assets, icons, fonts, the manifest, and the /app shell per language.',
    why: 'Fast loads, and the app opens offline. No user data (public/sw.js never caches API or storage routes).',
    perAccount: false, sensitive: false, source: 'public/sw.js',
  },
  {
    id: 'sw-version', area: LS, key: 'obelisk-sw-version', match: 'exact', category: 'offline',
    holds: 'The service worker version the page last reloaded for.', why: 'Reloads once per worker update, not in a loop.',
    perAccount: false, sensitive: false, source: 'src/app/[locale]/layout.tsx',
  },
  // ---- language -----------------------------------------------------------
  {
    id: 'locale-cookie', area: 'cookie', key: 'locale', match: 'exact', category: 'language',
    holds: 'The language picked (en, es or pt), for a year.', why: 'The language picked wins over the guess from the browser.',
    perAccount: false, sensitive: false, source: 'src/i18n/routing.ts',
  },
  // ---- analytics ----------------------------------------------------------
  {
    id: 'analytics-consent', area: LS, key: 'obelisk:analytics-consent', match: 'exact', category: 'analytics',
    holds: 'The answer to the Google Analytics question: `granted` or `denied`.',
    why: 'Analytics loads only after `granted`; without an answer the banner asks again and nothing from Google loads.',
    perAccount: false, sensitive: false, source: 'src/services/analytics/consent.ts',
  },
  {
    id: 'ga-client', area: 'cookie', key: GA_COOKIE, match: 'exact', category: 'analytics',
    holds: 'Google Analytics\' random client id, set by gtag.js (G-BZ4NB66WY0) on the site\'s domain for two years.',
    why: 'Counts returning visitors. Only after the person allowed Analytics; deleted when they change to "don\'t allow".',
    perAccount: false, sensitive: false, source: 'src/services/analytics/gtag.ts',
  },
  {
    id: 'ga-session', area: 'cookie', key: GA_COOKIE_PREFIX, match: 'prefix', category: 'analytics',
    holds: 'Google Analytics\' session state for the property (`_ga_<id>`).',
    why: 'Groups page views into visits. Only after the person allowed Analytics.',
    perAccount: false, sensitive: false, source: 'src/services/analytics/gtag.ts',
  },
];
