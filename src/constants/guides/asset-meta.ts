/**
 * Guides: asset meta. Values the code in `utils/guides/asset-meta.ts` reads,
 * kept here so every reader imports the one copy.
 */

import type { GuideAssetMeta } from '@/utils/guides/asset-meta';

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
