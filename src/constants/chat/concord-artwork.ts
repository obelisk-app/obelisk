/** Stable IDs stored in encrypted Concord metadata. */
export const CONCORD_ARTWORK_PRESETS = ['orbit', 'summit', 'bloom', 'tide'] as const;
export type ConcordArtworkPreset = (typeof CONCORD_ARTWORK_PRESETS)[number];
