import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  OPEN_SETTINGS_EVENT,
  RELAY_SETTINGS_ANCHOR,
  onOpenSettings,
  openSettings,
  revealSettingsSection,
} from './open-settings';

describe('open-settings', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('delivers the requested section to a listener', () => {
    const seen: string[] = [];
    const off = onOpenSettings(({ section }) => seen.push(section));
    openSettings('relays');
    expect(seen).toEqual(['relays']);
    off();
  });

  it('stops delivering once unsubscribed', () => {
    const handler = vi.fn();
    onOpenSettings(handler)();
    openSettings('relays');
    expect(handler).not.toHaveBeenCalled();
  });

  /**
   * The pill fires this from a header that is not an ancestor of the panel,
   * so a malformed event must not take the shell down with it.
   */
  it('ignores an event with no detail', () => {
    const handler = vi.fn();
    const off = onOpenSettings(handler);
    window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
    expect(handler).not.toHaveBeenCalled();
    off();
  });

  it('scrolls the relay block into view once it has painted', async () => {
    const target = document.createElement('div');
    target.id = RELAY_SETTINGS_ANCHOR;
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    document.body.appendChild(target);

    revealSettingsSection('relays');
    // Two rAF hops before it looks for the element.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
  });

  it('does not throw when the section is not mounted', async () => {
    revealSettingsSection('relays');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    // Reaching here without throwing is the assertion.
    expect(document.getElementById(RELAY_SETTINGS_ANCHOR)).toBeNull();
  });
});
