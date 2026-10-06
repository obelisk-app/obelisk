/** The landing page's static content: feature cards, step icons, roadmap phases, stack, guides, FAQ ids. */

export const FEATURE_KEYS = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    titleKey: 'features.nostrIdentity.title',
    descKey: 'features.nostrIdentity.desc',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
    titleKey: 'features.realtimeChat.title',
    descKey: 'features.realtimeChat.desc',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0110 0v4"/>
      </svg>
    ),
    titleKey: 'features.encryptedDMs.title',
    descKey: 'features.encryptedDMs.desc',
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
    titleKey: 'features.voice.title',
    descKey: 'features.voice.desc',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    ),
    titleKey: 'features.selfHosted.title',
    descKey: 'features.selfHosted.desc',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
    titleKey: 'features.zaps.title',
    descKey: 'features.zaps.desc',
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
    titleKey: 'features.games.title',
    descKey: 'features.games.desc',
  },
];

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
  { key: 'phase0', phase: 'Phase 0', status: 'done' as const },
  { key: 'phase1', phase: 'Phase 1', status: 'done' as const },
  { key: 'phase1_5', phase: 'Phase 1.5', status: 'done' as const },
  { key: 'phase2', phase: 'Phase 2', status: 'done' as const },
  { key: 'phase3', phase: 'Phase 3', status: 'done' as const },
  { key: 'phase6', phase: 'Phase 6', status: 'done' as const },
  { key: 'phase4', phase: 'Phase 4', status: 'done' as const },
  { key: 'phase5', phase: 'Phase 5', status: 'done' as const },
];

export const TECH_STACK: { name: string; desc: string; color: string; icon?: string; img?: string; href: string }[] = [
  { name: 'Next.js 16', desc: 'React framework (frontend only)', color: 'text-white', icon: '▲', href: 'https://nextjs.org' },
  { name: 'nostr-tools', desc: 'SimplePool, signing, encryption', color: 'text-purple-400', icon: '⚡', href: 'https://github.com/nbd-wtf/nostr-tools' },
  { name: 'NIP-29', desc: 'Relay-managed groups', color: 'text-lc-green', icon: '◫', href: 'https://github.com/nostr-protocol/nips/blob/master/29.md' },
  { name: 'NIP-17', desc: 'Gift-wrapped DMs', color: 'text-pink-400', icon: '✉', href: 'https://github.com/nostr-protocol/nips/blob/master/17.md' },
  // Six packages ship from this SDK (data, ui, dm, pq, signers, wallet), so the card
  // names the SDK rather than picking one of them. First entry to use `img` instead of
  // `icon`: the mark is white-on-transparent, so it reads on the lc-black card as is.
  { name: 'Nostr WoT SDK', desc: 'Profiles, WoT, gift wrap, post-quantum', color: 'text-lc-green', img: '/nostr-wot-logo.svg', href: 'https://github.com/nostr-wot/nostr-wot-sdk' },
  { name: 'NIP-57 + NIP-47', desc: 'Lightning zaps & NWC', color: 'text-orange-400', icon: '⚡', href: 'https://github.com/nostr-protocol/nips/blob/master/47.md' },
  { name: 'Zustand', desc: 'Client state', color: 'text-amber-400', icon: '◇', href: 'https://github.com/pmndrs/zustand' },
  { name: 'Tailwind v4', desc: 'Styling', color: 'text-cyan-400', icon: '~', href: 'https://tailwindcss.com' },
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
