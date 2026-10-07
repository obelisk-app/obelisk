/**
 * Every hero and diagram renders exactly the still frame committed under
 * `public/og/guides/` (what `npm run snap-guides` writes: the static markup
 * with the `animate-*` classes stripped), in every language.
 *
 * Written before the drawings were moved onto the markup-only rule (round
 * 29), so moving their geometry into `src/utils/guides/` provably drew the
 * same pictures. It also catches a drawing changed without re-running
 * `npm run snap-guides`, which would leave search and link previews showing
 * the old one.
 *
 * The four project marks are in it too: their frames were re-snapped in
 * round 30, after the screen-reader label was translated (38e1b64c).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { LOCALES, type Locale } from '@/i18n';
import { allMessages } from '@tests/support/messages';
import { HERO_REGISTRY, DIAGRAM_REGISTRY } from '@/components/guides/svg';
import { snapshotPaths } from '@/utils/guides/asset-meta';

/** The same cleaning `scripts/snap-guide-svgs.ts` applies. */
function stripAnimateClasses(svg: string): string {
  return svg.replace(/class="([^"]*)"/g, (_match, classes: string) => {
    const kept = classes.split(/\s+/).filter((c) => c && !c.startsWith('animate-')).join(' ');
    return kept ? `class="${kept}"` : '';
  });
}

function stillFrame(Component: React.ComponentType, locale: Locale): string {
  const intl = { locale, messages: allMessages(locale), timeZone: 'UTC' } as ComponentProps<typeof NextIntlClientProvider>;
  const raw = renderToStaticMarkup(createElement(NextIntlClientProvider, intl, createElement(Component)));
  return `<?xml version="1.0" encoding="UTF-8"?>\n${stripAnimateClasses(raw)}`;
}

const DRAWINGS = { ...HERO_REGISTRY, ...DIAGRAM_REGISTRY };

describe('guide drawings match their committed still frames', () => {
  it('covers every hero, the four diagrams and the four project marks', () => {
    const marks = Object.keys(DRAWINGS).filter((name) => name.startsWith('mark-'));
    expect(marks).toHaveLength(4);
    expect(Object.keys(DRAWINGS)).toHaveLength(Object.keys(HERO_REGISTRY).length + 8);
  });

  for (const locale of LOCALES) {
    for (const [name, Component] of Object.entries(DRAWINGS)) {
      it(`${name} (${locale})`, () => {
        const committed = readFileSync(join(process.cwd(), 'public', snapshotPaths(name, locale).svg), 'utf8');
        expect(stillFrame(Component, locale)).toBe(committed);
      });
    }
  }
});
