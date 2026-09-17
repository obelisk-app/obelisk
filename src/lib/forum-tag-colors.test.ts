import { describe, it, expect } from 'vitest';
import {
  TAG_PALETTES,
  paletteForTag,
  tagChipStyle,
  isTagColorKey,
} from './forum-tag-colors';

describe('TAG_PALETTES', () => {
  it('every entry is complete and has a unique key', () => {
    for (const p of TAG_PALETTES) {
      expect(p.key).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.text).toMatch(/^rgb\(/);
      expect(p.border).toMatch(/^rgba\(/);
      expect(p.bg).toMatch(/^rgba\(/);
      expect(p.bgActive).toMatch(/^rgba\(/);
    }
    expect(new Set(TAG_PALETTES.map((p) => p.key)).size).toBe(TAG_PALETTES.length);
  });

  it('keeps the existing lime accent available', () => {
    expect(TAG_PALETTES[0].key).toBe('lime');
    expect(TAG_PALETTES[0].text).toBe('rgb(180, 249, 83)');
  });
});

describe('paletteForTag', () => {
  it('honours an explicit palette key', () => {
    expect(paletteForTag({ id: 'anything', color: 'amber' }).key).toBe('amber');
  });

  it('derives a color from the id when none is set', () => {
    const p = paletteForTag({ id: 'hw', color: null });
    expect(TAG_PALETTES).toContain(p);
  });

  it('is stable for a given id', () => {
    const a = paletteForTag({ id: 'hardware' });
    const b = paletteForTag({ id: 'hardware' });
    expect(a.key).toBe(b.key);
  });

  it('gives different ids different colors (at least across a small set)', () => {
    const keys = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => paletteForTag({ id }).key);
    expect(new Set(keys).size).toBeGreaterThan(1);
  });

  it('falls back to the hash on an unknown key rather than trusting the relay', () => {
    // The color arrives from a relay; an arbitrary string must never reach a
    // style attribute.
    const evil = paletteForTag({ id: 'hw', color: 'url(javascript:alert(1))' });
    expect(TAG_PALETTES).toContain(evil);
    expect(evil.key).toBe(paletteForTag({ id: 'hw', color: null }).key);
  });

  it('treats an empty color as unset', () => {
    expect(paletteForTag({ id: 'hw', color: '' }).key)
      .toBe(paletteForTag({ id: 'hw', color: null }).key);
  });
});

describe('tagChipStyle', () => {
  it('deepens the background and border when active', () => {
    const idle = tagChipStyle({ id: 'hw', color: 'amber' }, false);
    const active = tagChipStyle({ id: 'hw', color: 'amber' }, true);
    expect(active.background).not.toBe(idle.background);
    expect(active.borderColor).not.toBe(idle.borderColor);
    // Text hue is the tag's identity — it must not change with selection.
    expect(active.color).toBe(idle.color);
  });

  it('produces distinct styles for distinct tags', () => {
    const a = tagChipStyle({ id: 'x', color: 'amber' });
    const b = tagChipStyle({ id: 'y', color: 'cyan' });
    expect(a.color).not.toBe(b.color);
  });
});

describe('isTagColorKey', () => {
  it('accepts known keys and rejects everything else', () => {
    expect(isTagColorKey('amber')).toBe(true);
    expect(isTagColorKey('chartreuse')).toBe(false);
    expect(isTagColorKey('')).toBe(false);
    expect(isTagColorKey(null)).toBe(false);
    expect(isTagColorKey(undefined)).toBe(false);
  });
});
