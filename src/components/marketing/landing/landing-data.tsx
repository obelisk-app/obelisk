/** The landing page's static content: feature cards, step icons, roadmap phases, stack, guides, FAQ ids. */

export const FEATURE_KEYS = [
  {
    icon: (
      <ShieldIcon size={28} strokeWidth={1.5} />
    ),
    titleKey: 'marketing.features.nostrIdentity.title',
    descKey: 'marketing.features.nostrIdentity.desc',
  },
  {
    icon: (
      <ChatIcon size={28} strokeWidth={1.5} />
    ),
    titleKey: 'marketing.features.realtimeChat.title',
    descKey: 'marketing.features.realtimeChat.desc',
  },
  {
    icon: (
      <LockLargeIcon size={28} strokeWidth={1.5} />
    ),
    titleKey: 'marketing.features.encryptedDMs.title',
    descKey: 'marketing.features.encryptedDMs.desc',
  },
  {
    icon: (
      <MicAltIcon size={28} strokeWidth={1.5} />
    ),
    titleKey: 'marketing.features.voice.title',
    descKey: 'marketing.features.voice.desc',
  },
  {
    icon: (
      <LayersIcon size={28} strokeWidth={1.5} />
    ),
    titleKey: 'marketing.features.selfHosted.title',
    descKey: 'marketing.features.selfHosted.desc',
  },
  {
    icon: (
      <BoltIcon size={28} strokeWidth={1.5} />
    ),
    titleKey: 'marketing.features.zaps.title',
    descKey: 'marketing.features.zaps.desc',
  },
  {
    icon: (
      // A die: the games are the one feature here you can lose at.
      <DiceIcon size={28} strokeWidth={1.5} />
    ),
    titleKey: 'marketing.features.games.title',
    descKey: 'marketing.features.games.desc',
  },
] as const;

export const STEP_ICONS = [
  <KeyAltIcon size={24} strokeWidth={1.5} key="s1" />,
  <LayersIcon size={24} strokeWidth={1.5} key="s2" />,
  <ChatIcon size={24} strokeWidth={1.5} key="s3" />,
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
  { key: 'phase7', num: '7', status: 'upcoming' as const },
] as const;

import type { MessageKey } from '@/i18n/keys';
import { BoltIcon, ChatIcon, DiceIcon, KeyAltIcon, LayersIcon, LockLargeIcon, MicAltIcon, ShieldIcon } from '@/assets/icons';

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
export const FAQ_IDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11'] as const;
