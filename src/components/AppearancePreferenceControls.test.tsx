import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('AppearancePreferenceControls', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('updates accent, background, and button colors', async () => {
    const user = userEvent.setup();
    const { default: AppearancePreferenceControls } = await import('./AppearancePreferenceControls');
    const { getPreferences } = await import('@/lib/preferences');

    render(<AppearancePreferenceControls />);

    await user.clear(screen.getByTestId('appearance-accent-color'));
    await user.type(screen.getByTestId('appearance-accent-color'), '#7ec8ff');
    await user.clear(screen.getByTestId('appearance-background-color'));
    await user.type(screen.getByTestId('appearance-background-color'), '#111827');
    await user.clear(screen.getByTestId('appearance-button-color'));
    await user.type(screen.getByTestId('appearance-button-color'), '#f0c14a');
    await user.clear(screen.getByTestId('appearance-bubble-color'));
    await user.type(screen.getByTestId('appearance-bubble-color'), '#ff7ad9');
    await user.selectOptions(screen.getByTestId('appearance-bubble-animation'), 'drift');

    expect(getPreferences()).toMatchObject({
      accentColor: '#7ec8ff',
      backgroundColor: '#111827',
      buttonColor: '#f0c14a',
      bubbleColor: '#ff7ad9',
      bubbleAnimation: 'drift',
    });
  });

  it('renders the compact mobile controls and resets to defaults', async () => {
    const user = userEvent.setup();
    const { default: AppearancePreferenceControls } = await import('./AppearancePreferenceControls');
    const { getPreferences, setPreference } = await import('@/lib/preferences');
    setPreference('accentColor', '#7ec8ff');
    setPreference('backgroundColor', '#111827');
    setPreference('buttonColor', '#f0c14a');
    setPreference('bubbleColor', '#ff7ad9');
    setPreference('bubbleAnimation', 'orbit');

    render(<AppearancePreferenceControls variant="mobile" />);

    expect(screen.getByTestId('appearance-controls')).toHaveClass('settings-section');

    await user.click(screen.getByRole('button', { name: /reset appearance/i }));

    expect(getPreferences()).toMatchObject({
      accentColor: '#b4f953',
      backgroundColor: '#0a0a0a',
      buttonColor: '#b4f953',
      bubbleColor: '#b4f953',
      bubbleAnimation: 'float',
    });
  });
});
