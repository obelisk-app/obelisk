import type { ZapPreset } from '@/types/preferences/preferences';

/** Emoji/text presentation selectors do not change a preset's payment meaning. */
export function findZapPreset(presets: readonly ZapPreset[], emoji: string): ZapPreset | undefined {
  const normalized = emoji.replace(/\uFE0F/g, '');
  return presets.find((preset) => preset.emoji.replace(/\uFE0F/g, '') === normalized);
}
