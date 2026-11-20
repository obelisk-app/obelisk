import type { ConcordArtworkPreset } from '@/constants/chat/concord-artwork';

/** Keep other extensions and allow each image to switch modes independently. */
export function concordArtworkMetadata(
  custom: Record<string, unknown> | undefined,
  icon: ConcordArtworkPreset | '',
  banner: ConcordArtworkPreset | '',
) {
  const current = custom?.obelisk;
  const obelisk = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
  return { ...custom, obelisk: { ...obelisk, artwork: { ...(icon && { icon }), ...(banner && { banner }) } } };
}
