import { APPEARANCE_DEFAULTS } from '@/constants/preferences/appearance';
import type { AppearancePreferences, BubbleAnimationStyle } from '@/types/preferences/appearance';

const ANIMATIONS = new Set<BubbleAnimationStyle>(['float', 'drift', 'orbit', 'still']);

export function sanitizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

export function normalizeAppearance(value: unknown): AppearancePreferences {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  return {
    accentColor: sanitizeHexColor(raw.accentColor, APPEARANCE_DEFAULTS.accentColor),
    backgroundColor: sanitizeHexColor(raw.backgroundColor, APPEARANCE_DEFAULTS.backgroundColor),
    buttonColor: sanitizeHexColor(raw.buttonColor, APPEARANCE_DEFAULTS.buttonColor),
    bubbleColor: sanitizeHexColor(raw.bubbleColor, APPEARANCE_DEFAULTS.bubbleColor),
    bubbleAnimation: ANIMATIONS.has(raw.bubbleAnimation as BubbleAnimationStyle)
      ? raw.bubbleAnimation as BubbleAnimationStyle : APPEARANCE_DEFAULTS.bubbleAnimation,
  };
}
