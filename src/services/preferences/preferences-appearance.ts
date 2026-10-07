/**
 * Appearance preferences as CSS custom properties: the four user colors plus
 * the tints and readable ink derived from them. Re-exported from `preferences.ts`.
 */
import { sanitizeHexColor, type Preferences } from './preferences-schema';
import { APPEARANCE_DEFAULTS } from '@/constants/preferences/preferences-schema';

export function getAppearanceCssVariables(prefs: Pick<Preferences, 'accentColor' | 'backgroundColor' | 'buttonColor' | 'bubbleColor'>): Record<string, string> {
  const accent = sanitizeHexColor(prefs.accentColor, APPEARANCE_DEFAULTS.accentColor);
  const background = sanitizeHexColor(prefs.backgroundColor, APPEARANCE_DEFAULTS.backgroundColor);
  const button = sanitizeHexColor(prefs.buttonColor, APPEARANCE_DEFAULTS.buttonColor);
  const bubble = sanitizeHexColor(prefs.bubbleColor, APPEARANCE_DEFAULTS.bubbleColor);

  return {
    '--obelisk-app-bg': background,
    '--obelisk-app-bg-soft': mixHex(background, '#ffffff', 0.035),
    '--obelisk-app-bg-panel': mixHex(background, '#ffffff', 0.065),
    '--obelisk-accent': accent,
    '--obelisk-accent-deep': mixHex(accent, '#000000', 0.22),
    // The "soft" tints are the BACKGROUND carrying a little accent, not the
    // accent carrying a little background. Written the other way round they
    // came out at 80-odd percent accent, which turned every surface that is
    // supposed to be a dark tint - tag chips, inline code, the mobile accent
    // panels - into a near-solid slab of lime with lime text on it. The
    // targets are the static values in globals.css (#2d3a1a / #1e2812) for
    // the default palette; see preferences.test.ts.
    '--obelisk-accent-soft': mixHex(background, accent, 0.2),
    '--obelisk-accent-ink': readableInk(accent),
    '--obelisk-button': button,
    '--obelisk-button-hover': mixHex(button, '#ffffff', 0.14),
    '--obelisk-button-ink': readableInk(button),
    '--obelisk-bubble': bubble,
    '--obelisk-bubble-soft': mixHex(background, bubble, 0.2),
    '--background': background,
    '--color-lc-black': background,
    '--color-lc-dark': mixHex(background, '#ffffff', 0.05),
    '--color-lc-card': mixHex(background, '#ffffff', 0.07),
    '--color-lc-green': accent,
    '--color-lc-green-dark': mixHex(accent, '#000000', 0.22),
    '--color-lc-olive': mixHex(background, accent, 0.2),
    '--color-lc-olive-dark': mixHex(background, accent, 0.12),
  };
}

function parseHex(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function toHexPart(value: number): string {
  return Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0');
}

function mixHex(base: string, target: string, targetAmount: number): string {
  const [r1, g1, b1] = parseHex(base);
  const [r2, g2, b2] = parseHex(target);
  const baseAmount = 1 - targetAmount;
  return `#${toHexPart(r1 * baseAmount + r2 * targetAmount)}${toHexPart(g1 * baseAmount + g2 * targetAmount)}${toHexPart(b1 * baseAmount + b2 * targetAmount)}`;
}

function readableInk(hex: string): string {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.42 ? '#0a0a0a' : '#fafafa';
}
