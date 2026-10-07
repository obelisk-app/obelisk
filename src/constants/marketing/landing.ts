/**
 * The landing page's fixed content: the feature cards, the roadmap phases,
 * the stack, the demo video, the guide cards and the FAQ ids. The copy is in
 * `marketing.json`; the icons each card and step shows are picked by
 * `FeatureGlyph` and `StepGlyph` (`src/components/marketing/landing/`).
 */
import type { MessageKey } from '@/i18n/keys';

/** The feature grid, in order; `id` picks the card's icon. */
export const FEATURE_KEYS = [
  { id: 'nostrIdentity', titleKey: 'marketing.features.nostrIdentity.title', descKey: 'marketing.features.nostrIdentity.desc' },
  { id: 'realtimeChat', titleKey: 'marketing.features.realtimeChat.title', descKey: 'marketing.features.realtimeChat.desc' },
  { id: 'encryptedDMs', titleKey: 'marketing.features.encryptedDMs.title', descKey: 'marketing.features.encryptedDMs.desc' },
  { id: 'voice', titleKey: 'marketing.features.voice.title', descKey: 'marketing.features.voice.desc' },
  { id: 'selfHosted', titleKey: 'marketing.features.selfHosted.title', descKey: 'marketing.features.selfHosted.desc' },
  { id: 'zaps', titleKey: 'marketing.features.zaps.title', descKey: 'marketing.features.zaps.desc' },
  { id: 'games', titleKey: 'marketing.features.games.title', descKey: 'marketing.features.games.desc' },
] as const;

export type LandingFeatureId = (typeof FEATURE_KEYS)[number]['id'];

/** One of the three "how it works" steps; its copy is `marketing.steps.<n>`. */
export type LandingStep = 1 | 2 | 3;

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
