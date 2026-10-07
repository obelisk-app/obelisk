import { DEFAULT_LOCALE, type Locale } from '@/i18n';
import type { MessageKey } from '@/i18n/keys';
import { HERO_ASSET_META, DIAGRAM_ASSET_META } from '@/constants/guides/asset-meta';

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
