/** The landing page's static content: feature cards, step icons, roadmap phases, stack, guides, FAQ ids. */

export const FEATURE_KEYS = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    titleKey: 'marketing.features.nostrIdentity.title',
    descKey: 'marketing.features.nostrIdentity.desc',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
    titleKey: 'marketing.features.realtimeChat.title',
    descKey: 'marketing.features.realtimeChat.desc',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0110 0v4"/>
      </svg>
    ),
    titleKey: 'marketing.features.encryptedDMs.title',
    descKey: 'marketing.features.encryptedDMs.desc',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="2" width="6" height="12" rx="3"/>
        <path d="M5 10v2a7 7 0 0014 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="22"/>
        <line x1="8" y1="22" x2="16" y2="22"/>
      </svg>
    ),
    titleKey: 'marketing.features.voice.title',
    descKey: 'marketing.features.voice.desc',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    ),
    titleKey: 'marketing.features.selfHosted.title',
    descKey: 'marketing.features.selfHosted.desc',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
    titleKey: 'marketing.features.zaps.title',
    descKey: 'marketing.features.zaps.desc',
  },
  {
    icon: (
      // A die: the games are the one feature here you can lose at.
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="8.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    ),
    titleKey: 'marketing.features.games.title',
    descKey: 'marketing.features.games.desc',
  },
] as const;

export const STEP_ICONS = [
  <svg key="s1" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
  </svg>,
  <svg key="s2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
    <path d="M2 17l10 5 10-5"/>
    <path d="M2 12l10 5 10-5"/>
  </svg>,
  <svg key="s3" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
  </svg>,
];

export const ROADMAP_PHASES = [
  { key: 'phase0', num: '0', status: 'done' as const },
  { key: 'phase1', num: '1', status: 'done' as const },
  { key: 'phase1_5', num: '1.5', status: 'done' as const },
  { key: 'phase2', num: '2', status: 'done' as const },
  { key: 'phase3', num: '3', status: 'done' as const },
  { key: 'phase6', num: '6', status: 'done' as const },
  { key: 'phase4', num: '4', status: 'done' as const },
  { key: 'phase5', num: '5', status: 'done' as const },
] as const;

import type { MessageKey } from '@/i18n/keys';

/** `name` is the product's own name, the same in every language; `descKey` is its line of copy. */
export const TECH_STACK: { name: string; descKey: MessageKey; color: string; icon?: string; img?: string; href: string }[] = [
  { name: 'Next.js 16', descKey: 'marketing.stack.item.nextjs', color: 'text-white', icon: '▲', href: 'https://nextjs.org' }, // i18n-exempt: product and protocol names
  { name: 'nostr-tools', descKey: 'marketing.stack.item.nostrTools', color: 'text-purple-400', icon: '⚡', href: 'https://github.com/nbd-wtf/nostr-tools' }, // i18n-exempt: product and protocol names
  { name: 'NIP-29', descKey: 'marketing.stack.item.nip29', color: 'text-lc-green', icon: '◫', href: 'https://github.com/nostr-protocol/nips/blob/master/29.md' }, // i18n-exempt: product and protocol names
  { name: 'NIP-17', descKey: 'marketing.stack.item.nip17', color: 'text-pink-400', icon: '✉', href: 'https://github.com/nostr-protocol/nips/blob/master/17.md' }, // i18n-exempt: product and protocol names
  // Six packages ship from this SDK (data, ui, dm, pq, signers, wallet), so the card
  // names the SDK rather than picking one of them. First entry to use `img` instead of
  // `icon`: the mark is white-on-transparent, so it reads on the lc-black card as is.
  { name: 'Nostr WoT SDK', descKey: 'marketing.stack.item.nostrWot', color: 'text-lc-green', img: '/nostr-wot-logo.svg', href: 'https://github.com/nostr-wot/nostr-wot-sdk' }, // i18n-exempt: product and protocol names
  { name: 'NIP-57 + NIP-47', descKey: 'marketing.stack.item.zaps', color: 'text-orange-400', icon: '⚡', href: 'https://github.com/nostr-protocol/nips/blob/master/47.md' }, // i18n-exempt: product and protocol names
  { name: 'Zustand', descKey: 'marketing.stack.item.zustand', color: 'text-amber-400', icon: '◇', href: 'https://github.com/pmndrs/zustand' }, // i18n-exempt: product and protocol names
  { name: 'Tailwind v4', descKey: 'marketing.stack.item.tailwind', color: 'text-cyan-400', icon: '~', href: 'https://tailwindcss.com' }, // i18n-exempt: product and protocol names
];


/** youtu.be/Z86oghQkUbk: the Obelisk walkthrough shown under the hero. */
export const DEMO_VIDEO_ID = 'Z86oghQkUbk';

/** The guide cards in the Learn section, in order. */
export const LEARN_GUIDES = [
  { slug: 'what-is-obelisk', tKey: 'whatIsObelisk' },
  { slug: 'how-obelisk-works', tKey: 'howObeliskWorks' },
  { slug: 'web-of-trust', tKey: 'webOfTrust' },
  { slug: 'bitcoin-zaps', tKey: 'bitcoinZaps' },
  { slug: 'admin-cli', tKey: 'adminCli' },
  { slug: 'future-nostr-relays', tKey: 'futureNostrRelays' },
] as const;

/** FAQ entries, in order; copy lives under `faq.<id>.question` / `.answer`. */
export const FAQ_IDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'] as const;
