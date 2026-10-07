/**
 * SEO: cards. Values the code in `utils/seo/cards.ts` reads, kept here so
 * every reader imports the one copy.
 */

/** The pages whose card is their own `seo.<copy>` title and description. */
export const PAGE_CARDS = {
  landing: { copy: 'site', path: '/' },
  app: { copy: 'app', path: '/app' },
  voice: { copy: 'voice', path: '/voice' },
  features: { copy: 'features', path: '/features' },
  desktop: { copy: 'desktop', path: '/desktop' },
  mobile: { copy: 'mobile', path: '/mobile' },
  help: { copy: 'help', path: '/help' },
  helpLocalData: { copy: 'helpLocalData', path: '/help/local-data' },
  mediaKit: { copy: 'mediaKit', path: '/media-kit' },
  guides: { copy: 'guides', path: '/guides' },
} as const satisfies Record<string, { copy: string; path: string }>;
