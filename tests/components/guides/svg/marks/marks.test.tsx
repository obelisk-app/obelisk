import { describe, it, expect } from 'vitest';
import { render as rtlRender } from '@testing-library/react';
import type { ReactElement } from 'react';
import { LocaleProvider, translator } from '@tests/support/intl';
import type { Locale } from '@/i18n';
import { DIAGRAM_REGISTRY } from '@/components/guides/svg/index';
import Mark from '@/components/guides/svg/embed/Mark';
import { DIAGRAM_ASSET_META } from '@/utils/guides/asset-meta';
import DexMark from '@/components/guides/svg/marks/DexMark';
import SfuMark from '@/components/guides/svg/marks/SfuMark';
import BotsMark from '@/components/guides/svg/marks/BotsMark';
import RelayMark from '@/components/guides/svg/marks/RelayMark';

const render = (ui: ReactElement, locale: Locale = 'en') =>
  rtlRender(<LocaleProvider initialLocale={locale}>{ui}</LocaleProvider>);

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
    expect(translator('en')(DIAGRAM_ASSET_META[name].altKey).length).toBeGreaterThan(20);
  });

  it('Mark renders the snapshot PNG alongside the live SVG', () => {
    const { container } = render(<Mark name="mark-dex" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/og/guides/mark-dex.png');
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('Mark points a Spanish page at the Spanish snapshot', () => {
    const { container } = render(<Mark name="mark-dex" />, 'es');
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/og/guides/es/mark-dex.png');
    expect(img?.getAttribute('alt')).toMatch(/^Isotipo de obelisk-dex/);
  });

  it('Mark returns null for an unknown name', () => {
    const { container } = render(<Mark name="does-not-exist" />);
    expect(container.firstChild).toBeNull();
  });
});
