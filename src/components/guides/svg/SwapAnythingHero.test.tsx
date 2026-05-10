import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import SwapAnythingHero from './SwapAnythingHero';
import SwapMatrixDiagram from './diagrams/SwapMatrixDiagram';
import { HERO_REGISTRY, DIAGRAM_REGISTRY, SvgHero, Diagram } from './index';

describe('SwapAnythingHero', () => {
  it('renders the four ecosystem pieces', () => {
    const { container } = render(<SwapAnythingHero />);
    const text = container.textContent ?? '';
    expect(text).toContain('obelisk-relay');
    expect(text).toContain('obelisk-dex');
    expect(text).toContain('obelisk-sfu');
    expect(text).toContain('obelisk-bots');
  });

  it('exposes an accessible title for screen readers', () => {
    const { container } = render(<SwapAnythingHero />);
    expect(container.querySelector('title')?.textContent).toMatch(/swap/i);
  });

  it('is registered under the swap-anything hero key', () => {
    expect(HERO_REGISTRY['swap-anything']).toBe(SwapAnythingHero);
  });
});

describe('SwapMatrixDiagram', () => {
  it('lists all four stack layers', () => {
    const { container } = render(<SwapMatrixDiagram />);
    const text = container.textContent ?? '';
    expect(text).toContain('Client');
    expect(text).toContain('Voice');
    expect(text).toContain('Bots');
    expect(text).toContain('Relay');
  });

  it('shows the obelisk projects in the OURS column', () => {
    const { container } = render(<SwapMatrixDiagram />);
    const text = container.textContent ?? '';
    expect(text).toContain('obelisk-dex');
    expect(text).toContain('obelisk-sfu');
    expect(text).toContain('obelisk-bots');
    expect(text).toContain('obelisk-relay');
  });

  it('is registered under the swap-matrix diagram key', () => {
    expect(DIAGRAM_REGISTRY['swap-matrix']).toBe(SwapMatrixDiagram);
  });
});

describe('SvgHero / Diagram indexable wrappers', () => {
  it('SvgHero renders an indexable <img> with alt + the live <svg>', () => {
    const { container } = render(<SvgHero name="swap-anything" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('/og/guides/swap-anything.png');
    expect(img?.getAttribute('alt')?.length ?? 0).toBeGreaterThan(40);
    expect(img?.getAttribute('width')).toBe('800');
    expect(img?.getAttribute('height')).toBe('400');
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('Diagram renders an indexable <img> with alt + the live <svg> + figcaption', () => {
    const { container } = render(
      <Diagram name="swap-matrix" caption="Test caption" />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('/og/guides/swap-matrix.png');
    expect(img?.getAttribute('alt')?.length ?? 0).toBeGreaterThan(40);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('figcaption')?.textContent).toBe('Test caption');
  });

  it('hides the live <svg> from screen readers so the <img> alt is the only label', () => {
    const { container } = render(<SvgHero name="swap-anything" />);
    const svgWrapper = container.querySelector('[aria-hidden="true"]');
    expect(svgWrapper?.querySelector('svg')).not.toBeNull();
  });
});
