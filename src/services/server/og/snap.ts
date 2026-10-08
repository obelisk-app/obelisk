/**
 * Writes the static pages' preview cards (`npm run snap-og`): every card
 * `staticCards` lists, in every language, as a PNG under `public/og/cards/`,
 * and each card's version, a hash of what it was drawn from (`OG_MANIFEST`,
 * read as `OG_CARD_VERSIONS`). The folder is
 * emptied first, so a page that is gone leaves no card behind.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { LOCALES, type Locale } from '@/i18n';
import type { Translate } from '@/i18n/keys';
import { OG_MANIFEST, OG_STATIC_DIR } from '@/constants/seo/og';
import { drawCardPng } from './draw';
import { cardFingerprint } from './fingerprint';
import { staticCards } from './static-cards';

/** File (as `staticCardFile` names it) -> version (`cardFingerprint`). */
export type CardManifest = Record<string, string>;

/** Draws every static card into `<root>/public` and writes the manifest; returns it. */
export async function snapStaticCards(
  translatorFor: (locale: Locale) => Translate,
  root: string = process.cwd(),
  log: (line: string) => void = () => {},
): Promise<CardManifest> {
  const publicDir = join(root, 'public');
  await rm(join(publicDir, OG_STATIC_DIR), { recursive: true, force: true });
  const manifest: CardManifest = {};
  for (const locale of LOCALES) {
    for (const card of await staticCards(translatorFor(locale), locale)) {
      const png = await drawCardPng(card.element);
      const out = join(publicDir, card.file);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, png);
      manifest[card.file] = cardFingerprint(card.element);
      log(`  ${card.file.padEnd(48)} ${(png.byteLength / 1024).toFixed(1).padStart(6)} KB`);
    }
  }
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(join(root, OG_MANIFEST), `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
  return sorted;
}
