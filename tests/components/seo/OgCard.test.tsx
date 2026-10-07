import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import OgCard from '@/components/seo/OgCard';
import OgArt from '@/assets/illustrations/seo/OgArt';
import type { OgIconName } from '@/utils/seo/cards';
import { PAGE_CARDS } from '@/constants/seo/cards';

const ICONS: OgIconName[] = [...(Object.keys(PAGE_CARDS) as OgIconName[]), 'note', 'profile', 'tag'];

describe('the page preview card', () => {
  it('shows the label, title, description and address it is given', () => {
    const html = renderToStaticMarkup(OgCard({ label: 'Guide', title: 'A title', subtitle: 'A line under it', footer: 'obelisk.ar/x', icon: 'landing' }));
    for (const text of ['Guide', 'A title', 'A line under it', 'obelisk.ar/x']) expect(html).toContain(text);
  });

  it('sets the title smaller as it grows', () => {
    const size = (title: string) => Number(/font-size:(\d+)px;font-weight:800;letter-spacing:-1.2px/.exec(
      renderToStaticMarkup(OgCard({ label: 'L', title, subtitle: '', footer: '', icon: 'app' })),
    )?.[1]);
    expect(size('short')).toBe(66);
    expect(size('x'.repeat(90))).toBe(40);
  });

  it('has a drawing for every page that has a card', () => {
    for (const name of ICONS) {
      const html = renderToStaticMarkup(OgArt({ name }));
      expect(html, name).toMatch(/^<svg[^>]*viewBox="0 0 200 200"><(g|path)/);
    }
  });
});
