import type { ZapPreset } from '@/types/preferences/preferences';
import { DEFAULT_ZAP_PRESETS } from '@/constants/wallet/zap';

export function validZapPresets(value: unknown): value is ZapPreset[] {
  if (!Array.isArray(value) || !value.length || value.length > 20) return false;
  const seen = new Set<string>();
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  for (const preset of value) {
    if (!preset || typeof preset.emoji !== 'string' || preset.emoji.length > 32
      || !/^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u200D]*$/u.test(preset.emoji)
      || Array.from(segmenter.segment(preset.emoji)).length !== 1
      || seen.has(preset.emoji.replace(/\uFE0F/g, '')) || !Number.isSafeInteger(preset.amountSats)
      || preset.amountSats <= 0 || preset.amountSats > Math.floor(Number.MAX_SAFE_INTEGER / 1000)) return false;
    seen.add(preset.emoji.replace(/\uFE0F/g, ''));
  }
  return value[0].emoji === '⚡';
}

export function normalizeZapPresets(value: unknown): ZapPreset[] {
  return (validZapPresets(value) ? value : DEFAULT_ZAP_PRESETS).map((preset) => ({ ...preset }));
}
