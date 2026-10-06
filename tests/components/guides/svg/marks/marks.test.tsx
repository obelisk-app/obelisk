import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DIAGRAM_REGISTRY, Mark } from '@/components/guides/svg/index';
import { DIAGRAM_ASSET_META } from '@/utils/guides/asset-meta';
import DexMark from '@/components/guides/svg/marks/DexMark';
import SfuMark from '@/components/guides/svg/marks/SfuMark';
import BotsMark from '@/components/guides/svg/marks/BotsMark';
import RelayMark from '@/components/guides/svg/marks/RelayMark';

describe('component marks', () => {
  const cases: Array<[string, React.ComponentType]> = [
    ['mark-dex', DexMark],
    ['mark-sfu', SfuMark],
    ['mark-bots', BotsMark],
    ['mark-relay', RelayMark],
  ];

  it.each(cases)('%s is registered in DIAGRAM_REGISTRY and has metadata', (name, Comp) => {
    expect(DIAGRAM_REGISTRY[name]).toBe(Comp);
    expect(DIAGRAM_ASSET_META[name]).toMatchObject({ width: 120, height: 120 });
    expect(DIAGRAM_ASSET_META[name].alt.length).toBeGreaterThan(20);
  });

  it('Mark renders the snapshot PNG alongside the live SVG', () => {
    const { container } = render(<Mark name="mark-dex" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/og/guides/mark-dex.png');
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('Mark returns null for an unknown name', () => {
    const { container } = render(<Mark name="does-not-exist" />);
    expect(container.firstChild).toBeNull();
  });
});
