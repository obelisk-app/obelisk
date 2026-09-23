import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en.json';
import { HINTS, hintForAnchor, hintsForSurface } from './registry';

const EN = en as Record<string, string>;

describe('hint registry', () => {
  it('has unique ids — they are the persisted seen-set', () => {
    const ids = HINTS.map((hint) => hint.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique anchors, so a click maps to exactly one hint', () => {
    const anchors = HINTS.map((hint) => hint.anchor);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it('has real copy for every hint in both directions', () => {
    // A missing key renders as the key itself, which would ship a callout
    // reading "hints.railFeed.body".
    for (const hint of HINTS) {
      expect(EN[hint.titleKey], hint.titleKey).toBeTruthy();
      expect(EN[hint.bodyKey], hint.bodyKey).toBeTruthy();
    }
  });

  it('orders a surface deterministically', () => {
    const server = hintsForSurface('server', 'desktop').map((hint) => hint.order);
    expect(server).toEqual([...server].sort((a, b) => a - b));
    expect(new Set(server).size).toBe(server.length);
  });

  it('keeps desktop-only hints off mobile', () => {
    // The rail does not exist on a phone; the bottom nav does.
    const mobile = hintsForSurface('server', 'mobile').map((hint) => hint.id);
    expect(mobile).not.toContain('rail-feed');
    expect(hintsForSurface('server', 'desktop').map((h) => h.id)).toContain('rail-feed');
  });

  it('gives both shells something on every surface it claims', () => {
    const surfaces = new Set(HINTS.map((hint) => hint.surface));
    for (const surface of surfaces) {
      const both = hintsForSurface(surface, 'desktop').length
        + hintsForSurface(surface, 'mobile').length;
      expect(both, surface).toBeGreaterThan(0);
    }
  });

  it('finds the hint behind an anchor', () => {
    expect(hintForAnchor('rail-feed')?.id).toBe('rail-feed');
    expect(hintForAnchor('not-a-control')).toBeUndefined();
  });
});
