/**
 * Renders every guide hero/diagram component to a still-frame SVG + 2x PNG
 * under public/og/guides. The live animated React components stay untouched —
 * these snapshots exist only so Google Image Search can index a real URL with
 * an alt-text-bearing <img>.
 *
 * Run:  npm run snap-guides
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Resvg } from '@resvg/resvg-js';

import { HERO_REGISTRY, DIAGRAM_REGISTRY } from '../src/components/guides/svg';
import {
  HERO_ASSET_META,
  DIAGRAM_ASSET_META,
  type GuideAssetMeta,
} from '../src/components/guides/svg/asset-meta';

const OUT_DIR = join(process.cwd(), 'public', 'og', 'guides');

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
) {
  const raw = renderToStaticMarkup(React.createElement(Component));
  const cleaned = stripAnimateClasses(raw);

  const svgPath = join(OUT_DIR, `${name}.svg`);
  await writeFile(svgPath, withXmlPreamble(cleaned), 'utf8');

  const resvg = new Resvg(cleaned, {
    fitTo: { mode: 'width', value: meta.width * 2 },
    background: '#0a0a0a',
  });
  const png = resvg.render().asPng();
  const pngPath = join(OUT_DIR, `${name}.png`);
  await writeFile(pngPath, png);

  const kb = (n: number) => `${(n / 1024).toFixed(1)}KB`;
  console.log(
    `  ${name.padEnd(20)} svg ${kb(Buffer.byteLength(cleaned)).padStart(8)}   png ${kb(png.byteLength).padStart(8)}   @${meta.width * 2}px`,
  );
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Snapshotting guide assets → ${OUT_DIR}`);

  console.log('\nHeroes:');
  for (const [name, Component] of Object.entries(HERO_REGISTRY)) {
    const meta = HERO_ASSET_META[name];
    if (!meta) {
      console.warn(`  ! "${name}" missing asset meta — skipping`);
      continue;
    }
    await snap(name, Component, meta);
  }

  console.log('\nDiagrams:');
  for (const [name, Component] of Object.entries(DIAGRAM_REGISTRY)) {
    const meta = DIAGRAM_ASSET_META[name];
    if (!meta) {
      console.warn(`  ! "${name}" missing asset meta — skipping`);
      continue;
    }
    await snap(name, Component, meta);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
