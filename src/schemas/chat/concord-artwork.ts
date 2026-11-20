import { CONCORD_ARTWORK_PRESETS, type ConcordArtworkPreset } from '@/constants/chat/concord-artwork';

type Artwork = { icon: ConcordArtworkPreset | ''; banner: ConcordArtworkPreset | '' };

export function parseConcordArtwork(custom: unknown): Artwork {
  const obelisk = record(record(custom).obelisk);
  const artwork = record(obelisk.artwork);
  return { icon: preset(artwork.icon), banner: preset(artwork.banner) };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function preset(value: unknown): ConcordArtworkPreset | '' {
  return CONCORD_ARTWORK_PRESETS.find((id) => id === value) ?? '';
}
