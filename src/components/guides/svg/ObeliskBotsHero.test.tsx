import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ObeliskBotsHero from './ObeliskBotsHero';
import { HERO_REGISTRY, SvgHero } from './index';

describe('ObeliskBotsHero', () => {
  it('renders the zap bot workflow labels', () => {
    const { container } = render(<ObeliskBotsHero />);
    const text = container.textContent ?? '';
    expect(text).toContain('ZAP BOT');
    expect(text).toContain('kind 9735');
    expect(text).toContain('kind 7 zap');
    expect(text).toContain('kind 9 post');
    expect(text).toContain('NIP-29 scan');
  });

  it('exposes an accessible title for screen readers', () => {
    const { container } = render(<ObeliskBotsHero />);
    expect(container.querySelector('title')?.textContent).toMatch(/Obelisk Bots/i);
  });

  it('is registered under the obelisk-bots hero key', () => {
    expect(HERO_REGISTRY['obelisk-bots']).toBe(ObeliskBotsHero);
  });

  it('SvgHero renders the indexable obelisk-bots image', () => {
    const { container } = render(<SvgHero name="obelisk-bots" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/og/guides/obelisk-bots.png');
    expect(img?.getAttribute('alt')?.toLowerCase()).toContain('zap bot');
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
