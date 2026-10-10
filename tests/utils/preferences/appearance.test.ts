import { describe, expect, it } from 'vitest';

/**
 * The appearance variables override the static ones in globals.css on every
 * page, including the marketing and guides pages, so if a "soft" tint comes
 * out the wrong way round, it does so everywhere at once. It did: the tag
 * chips on the guides rendered as lime text on a lime pill, because
 * `--color-lc-olive-dark` was 86% accent instead of 12%.
 */
describe('appearance css variables', () => {
  const DEFAULT_PALETTE = {
    accentColor: '#b4f953',
    backgroundColor: '#0a0a0a',
    buttonColor: '#b4f953',
    bubbleColor: '#b4f953',
  };

  function rgb(hex: string): [number, number, number] {
    return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  }

  /** WCAG relative luminance, for the contrast assertions below. */
  function luminance(hex: string): number {
    const [r, g, b] = rgb(hex).map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  it('reproduces the static globals.css palette for the default colors', async () => {
    const { getAppearanceCssVariables } = await import('@/utils/preferences/appearance');
    const vars = getAppearanceCssVariables(DEFAULT_PALETTE);

    // Exact, because these are pass-throughs.
    expect(vars['--obelisk-app-bg']).toBe('#0a0a0a');
    expect(vars['--obelisk-accent']).toBe('#b4f953');
    expect(vars['--obelisk-accent-ink']).toBe('#0a0a0a');

    // Mixed, so allow a few points of rounding against the CSS defaults.
    const near = (got: string, want: string, tolerance = 8) => {
      const a = rgb(got);
      const b = rgb(want);
      a.forEach((channel, i) => {
        expect(Math.abs(channel - b[i]), `${got} vs ${want}`).toBeLessThanOrEqual(tolerance);
      });
    };
    near(vars['--obelisk-accent-soft'], '#2d3a1a');
    near(vars['--obelisk-bubble-soft'], '#2d3a1a');
    near(vars['--color-lc-olive'], '#2d3a1a');
    near(vars['--color-lc-olive-dark'], '#1e2812');
    near(vars['--color-lc-dark'], '#171717');
    near(vars['--color-lc-card'], '#1a1a1a');
    near(vars['--color-lc-green-dark'], '#8bc34a', 10);
  });

  it('keeps accent-on-soft readable: the tag chips live on this', async () => {
    const { getAppearanceCssVariables } = await import('@/utils/preferences/appearance');
    for (const palette of [
      DEFAULT_PALETTE,
      { ...DEFAULT_PALETTE, accentColor: '#38bdf8' },
      { ...DEFAULT_PALETTE, accentColor: '#ffffff' },
      // A light background is a legitimate choice and must not invert the mix.
      { ...DEFAULT_PALETTE, backgroundColor: '#f5f5f5', accentColor: '#1d4ed8' },
    ]) {
      const vars = getAppearanceCssVariables(palette);
      for (const soft of ['--color-lc-olive-dark', '--color-lc-olive', '--obelisk-accent-soft']) {
        expect(
          contrast(vars['--obelisk-accent'], vars[soft]),
          `${soft} against the accent for ${JSON.stringify(palette)}`,
        ).toBeGreaterThan(4.5);
      }
    }
  });

  it('mixes soft tints toward the background, not toward the accent', async () => {
    const { getAppearanceCssVariables } = await import('@/utils/preferences/appearance');
    const vars = getAppearanceCssVariables(DEFAULT_PALETTE);
    const distance = (a: string, b: string) =>
      rgb(a).reduce((sum, channel, i) => sum + Math.abs(channel - rgb(b)[i]), 0);

    for (const soft of ['--color-lc-olive-dark', '--color-lc-olive', '--obelisk-accent-soft', '--obelisk-bubble-soft']) {
      expect(
        distance(vars[soft], '#0a0a0a'),
        `${soft} should sit near the background`,
      ).toBeLessThan(distance(vars[soft], '#b4f953'));
    }
  });
});
