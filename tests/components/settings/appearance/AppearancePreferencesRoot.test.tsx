import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AppearancePreferencesRoot', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    document.documentElement.removeAttribute('style');
    delete document.documentElement.dataset.bubbleAnimation;
  });

  it('paints the saved appearance on the page root and follows changes', async () => {
    const { default: AppearancePreferencesRoot } = await import('@/components/settings/appearance/AppearancePreferencesRoot');
    const { getAppearanceCssVariables, getPreferences, setPreference } = await import('@/services/preferences/preferences');
    const { container } = render(<AppearancePreferencesRoot />);
    expect(container).toBeEmptyDOMElement();
    const root = document.documentElement;
    for (const [name, value] of Object.entries(getAppearanceCssVariables(getPreferences()))) {
      expect(root.style.getPropertyValue(name)).toBe(value);
    }
    expect(root.dataset.bubbleAnimation).toBe('float');

    act(() => {
      setPreference('accentColor', '#7ec8ff');
      setPreference('bubbleAnimation', 'orbit');
    });
    const vars = getAppearanceCssVariables(getPreferences());
    const [someName] = Object.keys(vars);
    expect(root.style.getPropertyValue(someName)).toBe(vars[someName]);
    expect(Object.values(vars)).toContain(root.style.getPropertyValue(someName));
    expect(root.dataset.bubbleAnimation).toBe('orbit');
  });
});
