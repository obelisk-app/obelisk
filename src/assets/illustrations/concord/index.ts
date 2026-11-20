import orbitIcon from './orbit-icon.svg';
import orbitBanner from './orbit-banner.svg';
import summitIcon from './summit-icon.svg';
import summitBanner from './summit-banner.svg';
import bloomIcon from './bloom-icon.svg';
import bloomBanner from './bloom-banner.svg';
import tideIcon from './tide-icon.svg';
import tideBanner from './tide-banner.svg';
import type { ConcordArtworkPreset } from '@/constants/chat/concord-artwork';

const assets = {
  orbit: { icon: orbitIcon, banner: orbitBanner },
  summit: { icon: summitIcon, banner: summitBanner },
  bloom: { icon: bloomIcon, banner: bloomBanner },
  tide: { icon: tideIcon, banner: tideBanner },
};

export function concordArtworkUrl(preset: ConcordArtworkPreset | '', slot: 'icon' | 'banner'): string {
  if (!preset) return '';
  const asset: string | { src: string } = assets[preset][slot];
  return typeof asset === 'string' ? asset : asset.src;
}
