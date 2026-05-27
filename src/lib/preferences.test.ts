import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('preferences store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('persists appearance colors in the existing preferences blob', async () => {
    const { getPreferences, setPreference } = await import('./preferences');

    expect(getPreferences()).toMatchObject({
      accentColor: '#b4f953',
      backgroundColor: '#0a0a0a',
      buttonColor: '#b4f953',
      bubbleColor: '#b4f953',
      bubbleAnimation: 'float',
    });

    setPreference('accentColor', '#7ec8ff');
    setPreference('backgroundColor', '#111827');
    setPreference('buttonColor', '#f0c14a');
    setPreference('bubbleColor', '#ff7ad9');
    setPreference('bubbleAnimation', 'drift');

    expect(getPreferences()).toMatchObject({
      accentColor: '#7ec8ff',
      backgroundColor: '#111827',
      buttonColor: '#f0c14a',
      bubbleColor: '#ff7ad9',
      bubbleAnimation: 'drift',
    });
    expect(JSON.parse(localStorage.getItem('obelisk:preferences') ?? '{}')).toMatchObject({
      accentColor: '#7ec8ff',
      backgroundColor: '#111827',
      buttonColor: '#f0c14a',
      bubbleColor: '#ff7ad9',
      bubbleAnimation: 'drift',
    });
  });

  it('sanitizes invalid persisted color values and can reset appearance defaults', async () => {
    localStorage.setItem('obelisk:preferences', JSON.stringify({
      showActivityIndicator: false,
      accentColor: 'red',
      backgroundColor: '#111111',
      buttonColor: 'url(javascript:bad)',
      bubbleColor: 'pink',
      bubbleAnimation: 'teleport',
    }));

    const { getPreferences, resetAppearancePreferences } = await import('./preferences');
    expect(getPreferences()).toMatchObject({
      showActivityIndicator: false,
      accentColor: '#b4f953',
      backgroundColor: '#111111',
      buttonColor: '#b4f953',
      bubbleColor: '#b4f953',
      bubbleAnimation: 'float',
    });

    resetAppearancePreferences();

    expect(getPreferences()).toMatchObject({
      showActivityIndicator: false,
      accentColor: '#b4f953',
      backgroundColor: '#0a0a0a',
      buttonColor: '#b4f953',
      bubbleColor: '#b4f953',
      bubbleAnimation: 'float',
    });
  });
});
