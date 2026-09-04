import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('preferences store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('persists appearance colors in the existing preferences blob', async () => {
    const { getPreferences, setPreference } = await import('./preferences');

    expect(getPreferences()).toMatchObject({
      directMessagesEnabled: false,
      developerRelayDebug: false,
      profileFeedRelays: [
        'wss://relay.damus.io',
        'wss://nos.lol',
        'wss://relay.primal.net',
      ],
      accentColor: '#b4f953',
      backgroundColor: '#0a0a0a',
      buttonColor: '#b4f953',
      bubbleColor: '#b4f953',
      bubbleAnimation: 'float',
    });

    setPreference('directMessagesEnabled', true);
    setPreference('developerRelayDebug', true);
    setPreference('profileFeedRelays', ['wss://one.example', 'wss://two.example', 'wss://three.example']);
    setPreference('accentColor', '#7ec8ff');
    setPreference('backgroundColor', '#111827');
    setPreference('buttonColor', '#f0c14a');
    setPreference('bubbleColor', '#ff7ad9');
    setPreference('bubbleAnimation', 'drift');

    expect(getPreferences()).toMatchObject({
      directMessagesEnabled: true,
      developerRelayDebug: true,
      profileFeedRelays: ['wss://one.example', 'wss://two.example', 'wss://three.example'],
      accentColor: '#7ec8ff',
      backgroundColor: '#111827',
      buttonColor: '#f0c14a',
      bubbleColor: '#ff7ad9',
      bubbleAnimation: 'drift',
    });
    expect(JSON.parse(localStorage.getItem('obelisk:preferences') ?? '{}')).toMatchObject({
      directMessagesEnabled: true,
      developerRelayDebug: true,
      profileFeedRelays: ['wss://one.example', 'wss://two.example', 'wss://three.example'],
      accentColor: '#7ec8ff',
      backgroundColor: '#111827',
      buttonColor: '#f0c14a',
      bubbleColor: '#ff7ad9',
      bubbleAnimation: 'drift',
    });
  });

  it('stores DM opt-in as a non-secret boolean preference', async () => {
    const { DM_OPT_IN_PREFERENCE_KEY, DM_OPT_IN_STORAGE_KEY, setDmOptInEnabled } = await import('./dm/opt-in');

    expect(DM_OPT_IN_STORAGE_KEY).toBe('obelisk:preferences');
    expect(DM_OPT_IN_PREFERENCE_KEY).toBe('directMessagesEnabled');
    expect(`${DM_OPT_IN_STORAGE_KEY}:${DM_OPT_IN_PREFERENCE_KEY}`).not.toMatch(/session|secret|nsec|private|token/i);

    setDmOptInEnabled(true);

    const stored = JSON.parse(localStorage.getItem(DM_OPT_IN_STORAGE_KEY) ?? '{}');
    expect(stored[DM_OPT_IN_PREFERENCE_KEY]).toBe(true);
    expect(typeof stored[DM_OPT_IN_PREFERENCE_KEY]).toBe('boolean');
    expect(JSON.stringify(stored)).not.toMatch(/nsec|private|secret/i);
  });

  it('sanitizes invalid persisted color values and can reset appearance defaults', async () => {
    localStorage.setItem('obelisk:preferences', JSON.stringify({
      showActivityIndicator: false,
      developerRelayDebug: 'yes',
      accentColor: 'red',
      backgroundColor: '#111111',
      buttonColor: 'url(javascript:bad)',
      bubbleColor: 'pink',
      bubbleAnimation: 'teleport',
      profileFeedRelays: ['https://bad.example', 'wss://duplicate.example', 'wss://duplicate.example'],
    }));

    const { getPreferences, resetAppearancePreferences } = await import('./preferences');
    expect(getPreferences()).toMatchObject({
      showActivityIndicator: false,
      developerRelayDebug: false,
      accentColor: '#b4f953',
      backgroundColor: '#111111',
      buttonColor: '#b4f953',
      bubbleColor: '#b4f953',
      bubbleAnimation: 'float',
      profileFeedRelays: [
        'wss://relay.damus.io',
        'wss://nos.lol',
        'wss://relay.primal.net',
      ],
    });

    resetAppearancePreferences();

    expect(getPreferences()).toMatchObject({
      showActivityIndicator: false,
      developerRelayDebug: false,
      accentColor: '#b4f953',
      backgroundColor: '#0a0a0a',
      buttonColor: '#b4f953',
      bubbleColor: '#b4f953',
      bubbleAnimation: 'float',
    });
  });

  describe('postQuantumEnabled', () => {
    // On by default: the toggle gates the conversation notice and the
    // per-message marks as well as post-quantum sending, so defaulting off
    // hid the entire feature from anyone who never opened settings.
    it('defaults to true', async () => {
      const { getPreferences } = await import('./preferences');
      expect(getPreferences().postQuantumEnabled).toBe(true);
    });

    it('round-trips through setPreference', async () => {
      const { getPreferences, setPreference } = await import('./preferences');
      setPreference('postQuantumEnabled', false);
      expect(getPreferences().postQuantumEnabled).toBe(false);
      setPreference('postQuantumEnabled', true);
      expect(getPreferences().postQuantumEnabled).toBe(true);
    });

    it('respects a persisted opt-out', async () => {
      localStorage.setItem('obelisk:preferences', JSON.stringify({ postQuantumEnabled: false }));
      const { getPreferences } = await import('./preferences');
      expect(getPreferences().postQuantumEnabled).toBe(false);
    });

    it('falls back to the default when storage holds a non-boolean', async () => {
      localStorage.setItem('obelisk:preferences', JSON.stringify({ postQuantumEnabled: 'yes' }));
      const { getPreferences } = await import('./preferences');
      expect(getPreferences().postQuantumEnabled).toBe(true);
    });
  });
});

/**
 * The appearance variables override the static ones in globals.css on every
 * page, including the marketing and guides pages — so if a "soft" tint comes
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
    const { getAppearanceCssVariables } = await import('./preferences');
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

  it('keeps accent-on-soft readable — the tag chips live on this', async () => {
    const { getAppearanceCssVariables } = await import('./preferences');
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
    const { getAppearanceCssVariables } = await import('./preferences');
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
