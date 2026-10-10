import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APPEARANCE_STORAGE_KEY, LEGACY_PREFERENCES_STORAGE_KEY } from '../../src/constants/preferences/appearance';

const script = readFileSync('public/appearance.js', 'utf8');
const run = () => runInNewContext(script, { document, localStorage });

describe('before-paint appearance bootstrap', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); document.documentElement.removeAttribute('style'); });
  afterEach(() => vi.restoreAllMocks());

  it('paints saved colors before React and hydration never replaces them with defaults', async () => {
    localStorage.setItem(LEGACY_PREFERENCES_STORAGE_KEY, JSON.stringify({ accentColor: '#123456', bubbleAnimation: 'orbit' }));
    run();
    expect(document.documentElement.style.getPropertyValue('--obelisk-accent')).toBe('#123456');
    expect(document.documentElement.dataset.bubbleAnimation).toBe('orbit');
    const initialStyle = document.documentElement.getAttribute('style');
    const { applyAppearance } = await import('../../src/services/preferences/appearance-dom');
    const { getAppearancePreferences } = await import('../../src/services/preferences/appearance');
    const writes = vi.spyOn(document.documentElement.style, 'setProperty');
    applyAppearance(document.documentElement, getAppearancePreferences());
    expect(document.documentElement.getAttribute('style')).toBe(initialStyle);
    expect(writes).not.toHaveBeenCalled();
  });

  it('uses the current key in preference to stale legacy colors', () => {
    localStorage.setItem(LEGACY_PREFERENCES_STORAGE_KEY, JSON.stringify({ accentColor: '#123456' }));
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ accentColor: '#abcdef' }));
    run();
    expect(document.documentElement.style.getPropertyValue('--obelisk-accent')).toBe('#abcdef');
  });

  it('renders defaults despite corrupt or inaccessible storage', () => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, '{broken');
    expect(run).not.toThrow();
    expect(document.documentElement.style.getPropertyValue('--obelisk-accent')).toBe('#b4f953');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(run).not.toThrow();
  });
});
