import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider } from '@/i18n/context';
import { RELAY_SETTINGS_ANCHOR } from '@/lib/open-settings';

const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);

const saved: { socialRelays: string[] } = { socialRelays: ['wss://relay.damus.io'] };
const setPreference = vi.fn((key: string, value: unknown) => {
  if (key === 'socialRelays') saved.socialRelays = value as string[];
});

vi.mock('@/lib/preferences', () => ({
  usePreferences: () => saved,
  setPreference: (key: string, value: unknown) => setPreference(key, value),
}));

vi.mock('@/lib/nostr-bridge', () => ({ useMyPubkey: () => null }));

vi.mock('@/lib/social/pool', () => ({
  applySocialRelays: vi.fn(),
  importNip65Relays: vi.fn(async () => []),
}));

/**
 * The snapshot must be referentially stable — `useSyncExternalStore` compares
 * by identity, so returning a fresh `{}` per call re-renders forever.
 */
const NO_STATUSES = Object.freeze({});

vi.mock('@/lib/social/relay-status', () => ({
  getRelayStatuses: () => NO_STATUSES,
  subscribeRelayStatus: () => () => {},
  probeRelay: vi.fn(),
  watchRelays: vi.fn(),
}));

import SocialRelaySettings from './SocialRelaySettings';

describe('SocialRelaySettings', () => {
  beforeEach(() => {
    saved.socialRelays = ['wss://relay.damus.io'];
    setPreference.mockClear();
  });

  /**
   * The list used to be free-text only, which is a dead end if you don't
   * already know a relay hostname — the commonest cause of an empty feed.
   */
  it('offers suggested relays with a note on what each is for', () => {
    renderLocalized(<SocialRelaySettings />);
    const presets = screen.getAllByTestId('social-relay-preset');
    expect(presets.length).toBeGreaterThan(3);
    expect(within(presets[0]).getByText(/relay\.damus\.io/)).toBeTruthy();
    expect(screen.getAllByText('Search and archive').length).toBeGreaterThan(0);
  });

  it('marks a suggestion already in the list as added, and refuses to re-add it', async () => {
    renderLocalized(<SocialRelaySettings />);
    const added = screen.getAllByTestId('social-relay-preset')
      .find((chip) => chip.getAttribute('data-added') === 'true');
    expect(added).toBeTruthy();
    expect(within(added!).getByText(/relay\.damus\.io/)).toBeTruthy();
    expect((added as HTMLButtonElement).disabled).toBe(true);
  });

  it('adds a suggestion to the draft list', async () => {
    const user = userEvent.setup();
    renderLocalized(<SocialRelaySettings />);
    const chip = screen.getAllByTestId('social-relay-preset')
      .find((c) => c.textContent?.includes('nos.lol'))!;
    await user.click(chip);
    expect(screen.getByDisplayValue('wss://nos.lol')).toBeTruthy();
  });

  /**
   * Clicking a suggestion while an empty row is open used to append past it,
   * spending one of the eight slots on a blank.
   */
  it('fills an empty row rather than appending past it', async () => {
    const user = userEvent.setup();
    renderLocalized(<SocialRelaySettings />);
    await user.click(screen.getByTestId('social-relay-add'));
    const chip = screen.getAllByTestId('social-relay-preset')
      .find((c) => c.textContent?.includes('nos.lol'))!;
    await user.click(chip);

    const urls = screen.getAllByRole('textbox').map((i) => (i as HTMLInputElement).value);
    expect(urls).toEqual(['wss://relay.damus.io', 'wss://nos.lol']);
  });

  it('saves a suggestion that was clicked', async () => {
    const user = userEvent.setup();
    renderLocalized(<SocialRelaySettings />);
    const chip = screen.getAllByTestId('social-relay-preset')
      .find((c) => c.textContent?.includes('nos.lol'))!;
    await user.click(chip);
    await user.click(screen.getByTestId('social-relay-save'));

    expect(setPreference).toHaveBeenCalledWith(
      'socialRelays',
      expect.arrayContaining(['wss://relay.damus.io', 'wss://nos.lol']),
    );
  });

  /** The relay pill scrolls to this id after opening the panel. */
  it('carries the anchor the relay pill scrolls to', () => {
    const { container } = renderLocalized(<SocialRelaySettings />);
    expect(container.querySelector(`#${RELAY_SETTINGS_ANCHOR}`)).toBeTruthy();
  });
});
