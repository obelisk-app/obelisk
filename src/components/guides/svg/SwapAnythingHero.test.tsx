import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import SwapAnythingHero from './SwapAnythingHero';
import SwapMatrixDiagram from './diagrams/SwapMatrixDiagram';
import { HERO_REGISTRY, DIAGRAM_REGISTRY } from './index';

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
