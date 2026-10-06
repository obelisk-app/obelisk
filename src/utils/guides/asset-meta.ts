import { DEFAULT_LOCALE, type Locale } from '@/i18n';
import type { MessageKey } from '@/i18n/keys';

export interface GuideAssetMeta {
  /** The image's alt text, also its JSON-LD caption: `guides.asset.alt.*`. */
  altKey: MessageKey;
  width: number;
  height: number;
  /**
   * If set, snap-guide-svgs also writes `<name>-banner.png` rendered at this
   * width - for reuse as repo logos / social banners outside this project.
   */
  bannerWidth?: number;
}

export const HERO_ASSET_META: Record<string, GuideAssetMeta> = {
  'what-is-obelisk': {
    width: 800,
    height: 400,
    altKey: 'guides.asset.alt.whatIsObelisk',
  },
  'how-obelisk-works': {
    width: 800,
    height: 400,
    altKey: 'guides.asset.alt.howObeliskWorks',
  },
  wot: {
    width: 800,
    height: 400,
    altKey: 'guides.asset.alt.wot',
  },
  'future-relays': {
    width: 800,
    height: 400,
    altKey: 'guides.asset.alt.futureRelays',
  },
  'bitcoin-zaps': {
    width: 800,
    height: 400,
    altKey: 'guides.asset.alt.bitcoinZaps',
  },
  'admin-cli': {
    width: 800,
    height: 400,
    altKey: 'guides.asset.alt.adminCli',
  },
  'swap-anything': {
    width: 800,
    height: 400,
    altKey: 'guides.asset.alt.swapAnything',
  },
  'obelisk-bots': {
    width: 800,
    height: 400,
    altKey: 'guides.asset.alt.obeliskBots',
  },
  'quantum-safe': {
    width: 800,
    height: 400,
    altKey: 'guides.asset.alt.quantumSafe',
  },
  'chain-reaction': {
    width: 800,
    height: 400,
    altKey: 'guides.asset.alt.chainReaction',
  },
  vesta: {
    width: 800,
    height: 400,
    altKey: 'guides.asset.alt.vesta',
  },
  stacker: {
    width: 800,
    height: 400,
    altKey: 'guides.asset.alt.stacker',
  },
  'run-your-own-relay': {
    width: 800,
    height: 400,
    altKey: 'guides.asset.alt.runYourOwnRelay',
  },
};

export const DIAGRAM_ASSET_META: Record<string, GuideAssetMeta> = {
  'wot-graph': {
    width: 800,
    height: 320,
    altKey: 'guides.asset.alt.wotGraph',
  },
  'relay-groups': {
    width: 800,
    height: 360,
    altKey: 'guides.asset.alt.relayGroups',
  },
  'zap-flow': {
    width: 900,
    height: 360,
    altKey: 'guides.asset.alt.zapFlow',
  },
  'swap-matrix': {
    width: 790,
    height: 352,
    altKey: 'guides.asset.alt.swapMatrix',
  },
  'mark-dex': {
    width: 120,
    height: 120,
    bannerWidth: 1600,
    altKey: 'guides.asset.alt.markDex',
  },
  'mark-sfu': {
    width: 120,
    height: 120,
    bannerWidth: 1600,
    altKey: 'guides.asset.alt.markSfu',
  },
  'mark-bots': {
    width: 120,
    height: 120,
    bannerWidth: 1600,
    altKey: 'guides.asset.alt.markBots',
  },
  'mark-relay': {
    width: 120,
    height: 120,
    bannerWidth: 1600,
    altKey: 'guides.asset.alt.markRelay',
  },
};

export function isHero(name: string): boolean {
  return name in HERO_ASSET_META;
}

export function getAssetMeta(name: string): GuideAssetMeta | undefined {
  return HERO_ASSET_META[name] ?? DIAGRAM_ASSET_META[name];
}

/**
 * The still-frame snapshots `npm run snap-guides` writes for one asset. The
 * artwork carries words, so each language has its own: English at the top
 * of `/og/guides/`, Spanish and Portuguese under `/og/guides/<locale>/`.
 */
export function snapshotPaths(name: string, locale: Locale = DEFAULT_LOCALE): { svg: string; png: string } {
  const dir = locale === DEFAULT_LOCALE ? '/og/guides' : `/og/guides/${locale}`;
  return {
    svg: `${dir}/${name}.svg`,
    png: `${dir}/${name}.png`,
  };
}

export function listAssetNames(): string[] {
  return [...Object.keys(HERO_ASSET_META), ...Object.keys(DIAGRAM_ASSET_META)];
}
