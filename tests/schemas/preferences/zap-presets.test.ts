import { describe, expect, it } from 'vitest';
import { normalizeZapPresets, validZapPresets } from '@/schemas/preferences/zap-presets';

describe('zap presets', () => {
  it('migrates the persisted old defaults while preserving customized lists', () => {
    const legacy = [
      { emoji: '⚡', amountSats: 21 }, { emoji: '🔥', amountSats: 100 },
      { emoji: '🚀', amountSats: 1000 }, { emoji: '💎', amountSats: 10000 },
    ];
    expect(normalizeZapPresets(legacy).map((p) => p.amountSats)).toEqual([21, 210, 420]);
    const customized = legacy.map((p, index) => index === 1 ? { ...p, amountSats: 123 } : p);
    expect(normalizeZapPresets(customized)).toEqual(customized);
  });
  it('migrates missing or invalid settings to the defaults', () => {
    expect(normalizeZapPresets(null).map((p) => p.amountSats)).toEqual([21, 210, 420]);
    expect(normalizeZapPresets([])[0]).toEqual({ emoji: '⚡', amountSats: 21 });
  });
  it('accepts customized amounts and Unicode emoji sequences', () => {
    const presets = [{ emoji: '⚡', amountSats: 42 }, { emoji: '👨‍👩‍👧', amountSats: 123 }];
    expect(validZapPresets(presets)).toBe(true);
    expect(normalizeZapPresets(presets)).toEqual(presets);
    expect(normalizeZapPresets(presets)).not.toBe(presets);
  });
  it('rejects duplicate emojis, fractional, unsafe, negative amounts and text', () => {
    for (const second of [
      { emoji: '⚡', amountSats: 100 }, { emoji: '🔥', amountSats: 1.5 },
      { emoji: '🔥', amountSats: 0 }, { emoji: '🔥', amountSats: -1 },
      { emoji: '🔥', amountSats: Number.MAX_SAFE_INTEGER }, { emoji: '🔥🔥', amountSats: 21 }, { emoji: 'hello', amountSats: 1 },
    ]) expect(validZapPresets([{ emoji: '⚡', amountSats: 21 }, second])).toBe(false);
  });
});
