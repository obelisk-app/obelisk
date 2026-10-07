import '@tests/support/game-engines';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import Harness from '@/app/dev/game-shots/Harness';
import Frame from '@/app/dev/game-shots/Frame';

/** `scripts/snap-game-shots.mjs` captures every `data-shot` once `[data-shots-ready]` is on the page. */
describe('game shots harness', () => {
  it('mounts every shot the guides use, and says it is ready', () => {
    const { container } = render(<LocaleProvider initialLocale="en"><Harness /></LocaleProvider>);
    const shots = Array.from(container.querySelectorAll('[data-shot]')).map((el) => el.getAttribute('data-shot'));
    expect(shots).toEqual([
      'games-feature',
      'chain-reaction-board',
      'chain-reaction-fullscreen',
      'chain-reaction-result',
      'vesta-board',
      'stacker-well',
      'stacker-table',
    ]);
    expect(container.querySelector('[data-shots-ready="true"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="game-results"]')).not.toBeNull();
  });

  it('frames a shot at the width it was given', () => {
    const { container } = render(<Frame name="x" width={300}><span>inside</span></Frame>);
    const shot = container.querySelector('[data-shot="x"]') as HTMLElement;
    expect(shot.style.width).toBe('300px');
    expect(shot).toHaveTextContent('inside');
  });
});
