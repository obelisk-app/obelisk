/**
 * Renders every guide hero/diagram component to a still-frame SVG + 2x PNG
 * under public/og/guides. The live animated React components stay untouched;
 * these snapshots exist only so Google Image Search can index a real URL with
 * an alt-text-bearing <img>, and so a shared guide's preview has a picture.
 *
 * The artwork's words come from the `guides` messages, so every language gets
 * its own set: English at the top of public/og/guides (the URLs that existed
 * before there were languages), Spanish and Portuguese under es/ and pt/.
 * `snapshotPaths(name, locale)` in src/utils/guides/asset-meta.ts is the other
 * half of that layout. Banners (`bannerWidth`) are English only.
 *
 * Run:  npm run snap-guides
 */
import { readFileSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { Resvg } from '@resvg/resvg-js';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@/i18n';
import { MODULES } from '@/i18n/modules';

import { HERO_REGISTRY, DIAGRAM_REGISTRY } from '../src/assets/illustrations/guides';
import type { GuideAssetMeta } from '@/utils/guides/asset-meta';
import { HERO_ASSET_META, DIAGRAM_ASSET_META } from '@/constants/guides/asset-meta';

const OUT_DIR = join(process.cwd(), 'public', 'og', 'guides');
const MESSAGES_DIR = join(process.cwd(), 'src', 'i18n', 'messages');

/** Every module of one language, read from disk the way the server loads them. */
function messagesFor(locale: Locale): Record<string, unknown> {
  return Object.fromEntries(
    MODULES.map((m) => [m, JSON.parse(readFileSync(join(MESSAGES_DIR, locale, `${m}.json`), 'utf8'))]),
  );
}

function outDirFor(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? OUT_DIR : join(OUT_DIR, locale);
}

function stripAnimateClasses(svg: string): string {
  return svg.replace(/class="([^"]*)"/g, (_match, classes: string) => {
    const kept = classes
      .split(/\s+/)
      .filter((c) => c && !c.startsWith('animate-'))
      .join(' ');
    return kept ? `class="${kept}"` : '';
  });
}

function withXmlPreamble(markup: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`;
}

async function snap(
  name: string,
  Component: React.ComponentType,
  meta: GuideAssetMeta,
  locale: Locale,
  messages: Record<string, unknown>,
) {
  // The type insists on `children` in the props; they arrive as the third argument.
  const intl = { locale, messages, timeZone: 'UTC' } as React.ComponentProps<typeof NextIntlClientProvider>;
  const raw = renderToStaticMarkup(
    React.createElement(NextIntlClientProvider, intl, React.createElement(Component)),
  );
  const cleaned = stripAnimateClasses(raw);
  const dir = outDirFor(locale);

  const svgPath = join(dir, `${name}.svg`);
  await writeFile(svgPath, withXmlPreamble(cleaned), 'utf8');

  const resvg = new Resvg(cleaned, {
    fitTo: { mode: 'width', value: meta.width * 2 },
    background: '#0a0a0a',
  });
  const png = resvg.render().asPng();
  const pngPath = join(dir, `${name}.png`);
  await writeFile(pngPath, png);

  const kb = (n: number) => `${(n / 1024).toFixed(1)}KB`;
  let bannerSuffix = '';
  if (meta.bannerWidth && locale === DEFAULT_LOCALE) {
    const bannerResvg = new Resvg(cleaned, {
      fitTo: { mode: 'width', value: meta.bannerWidth },
      background: '#0a0a0a',
    });
    const bannerPng = bannerResvg.render().asPng();
    const bannerPath = join(OUT_DIR, `${name}-banner.png`);
    await writeFile(bannerPath, bannerPng);
    bannerSuffix = `   banner ${kb(bannerPng.byteLength).padStart(8)} @${meta.bannerWidth}px`;
  }
  console.log(
    `  ${locale} ${name.padEnd(20)} svg ${kb(Buffer.byteLength(cleaned)).padStart(8)}   png ${kb(png.byteLength).padStart(8)}   @${meta.width * 2}px${bannerSuffix}`,
  );
}

async function main() {
  console.log(`Snapshotting guide assets → ${OUT_DIR}`);
  for (const locale of LOCALES) {
    await mkdir(outDirFor(locale), { recursive: true });
    const messages = messagesFor(locale);

    console.log(`\nHeroes (${locale}):`);
    for (const [name, Component] of Object.entries(HERO_REGISTRY)) {
      const meta = HERO_ASSET_META[name];
      if (!meta) {
        console.warn(`  ! "${name}" missing asset meta; skipping`);
        continue;
      }
      await snap(name, Component, meta, locale, messages);
    }

    console.log(`\nDiagrams (${locale}):`);
    for (const [name, Component] of Object.entries(DIAGRAM_REGISTRY)) {
      const meta = DIAGRAM_ASSET_META[name];
      if (!meta) {
        console.warn(`  ! "${name}" missing asset meta; skipping`);
        continue;
      }
      await snap(name, Component, meta, locale, messages);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
