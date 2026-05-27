'use client';

import { useSyncExternalStore } from 'react';
import { createLocalStore } from './local-store';

export interface Preferences {
  showActivityIndicator: boolean;
  accentColor: string;
  backgroundColor: string;
  buttonColor: string;
}

const DEFAULTS: Preferences = {
  showActivityIndicator: true,
  accentColor: '#b4f953',
  backgroundColor: '#0a0a0a',
  buttonColor: '#b4f953',
};

export const APPEARANCE_DEFAULTS = {
  accentColor: DEFAULTS.accentColor,
  backgroundColor: DEFAULTS.backgroundColor,
  buttonColor: DEFAULTS.buttonColor,
} as const;

const COLOR_KEYS = new Set<keyof Preferences>(['accentColor', 'backgroundColor', 'buttonColor']);
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

const store = createLocalStore<Partial<Preferences>>('obelisk:preferences', {});
let current: Preferences = normalizePreferences(store.load());
const listeners = new Set<() => void>();

export function getPreferences(): Preferences {
  return current;
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  const normalized = normalizePreferenceValue(key, value);
  if (current[key] === normalized) return;
  current = { ...current, [key]: normalized };
  store.save(current);
  listeners.forEach((l) => l());
}

export function resetAppearancePreferences(): void {
  current = {
    ...current,
    accentColor: APPEARANCE_DEFAULTS.accentColor,
    backgroundColor: APPEARANCE_DEFAULTS.backgroundColor,
    buttonColor: APPEARANCE_DEFAULTS.buttonColor,
  };
  store.save(current);
  listeners.forEach((l) => l());
}

export function getAppearanceCssVariables(prefs: Pick<Preferences, 'accentColor' | 'backgroundColor' | 'buttonColor'>): Record<string, string> {
  const accent = sanitizeHexColor(prefs.accentColor, APPEARANCE_DEFAULTS.accentColor);
  const background = sanitizeHexColor(prefs.backgroundColor, APPEARANCE_DEFAULTS.backgroundColor);
  const button = sanitizeHexColor(prefs.buttonColor, APPEARANCE_DEFAULTS.buttonColor);

  return {
    '--obelisk-app-bg': background,
    '--obelisk-accent': accent,
    '--obelisk-accent-deep': mixHex(accent, '#000000', 0.22),
    '--obelisk-accent-soft': mixHex(accent, background, 0.18),
    '--obelisk-accent-ink': readableInk(accent),
    '--obelisk-button': button,
    '--obelisk-button-hover': mixHex(button, '#ffffff', 0.14),
    '--obelisk-button-ink': readableInk(button),
    '--background': background,
    '--color-lc-black': background,
    '--color-lc-green': accent,
    '--color-lc-green-dark': mixHex(accent, '#000000', 0.22),
    '--color-lc-olive': mixHex(accent, background, 0.22),
    '--color-lc-olive-dark': mixHex(accent, background, 0.14),
  };
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => DEFAULTS,
  );
}

function normalizePreferences(raw: Partial<Preferences>): Preferences {
  return {
    showActivityIndicator: typeof raw.showActivityIndicator === 'boolean'
      ? raw.showActivityIndicator
      : DEFAULTS.showActivityIndicator,
    accentColor: sanitizeHexColor(raw.accentColor, DEFAULTS.accentColor),
    backgroundColor: sanitizeHexColor(raw.backgroundColor, DEFAULTS.backgroundColor),
    buttonColor: sanitizeHexColor(raw.buttonColor, DEFAULTS.buttonColor),
  };
}

function normalizePreferenceValue<K extends keyof Preferences>(key: K, value: Preferences[K]): Preferences[K] {
  if (!COLOR_KEYS.has(key)) return value;
  const fallback = DEFAULTS[key] as string;
  return sanitizeHexColor(value, fallback) as Preferences[K];
}

function sanitizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return HEX_COLOR_RE.test(trimmed) ? trimmed.toLowerCase() : fallback;
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
