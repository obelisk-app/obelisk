import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { translator } from '@tests/support/intl';
import { LOCALES } from '@/i18n';
import { cardFingerprint } from '@/services/server/og/fingerprint';
import { staticCards } from '@/services/server/og/static-cards';
import { OG_CARD_VERSIONS, OG_SIZE, OG_STATIC_DIR } from '@/constants/seo/og';
import { imageSize } from '../../../../scripts/seo/lib/image-size';

/**
 * The static pages' cards are committed PNGs (`npm run snap-og`). Each one
 * is recorded with its version, a hash of what it was drawn from (its
 * markup: text, layout and art; `src/constants/seo/og-card-versions.json`),
 * so a change to a page's seo copy, a guide's front matter or the card
 * design fails here until the cards are drawn again. Rendering markup is
 * cheap; drawing the PNGs is left to the script.
 */
const PUBLIC = join(process.cwd(), 'public');
const manifest = OG_CARD_VERSIONS;

async function current(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const locale of LOCALES) {
    for (const card of await staticCards(translator(locale), locale)) out[card.file] = cardFingerprint(card.element);
  }
  return out;
}

function pngsUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? pngsUnder(join(dir, e.name)) : e.name.endsWith('.png') ? [join(dir, e.name)] : []);
}

describe('the static preview cards', () => {
  it('are drawn from today\'s copy and design (run `npm run snap-og` if this fails)', async () => {
    const now = await current();
    expect(Object.keys(manifest).sort()).toEqual(Object.keys(now).sort());
    const stale = Object.keys(now).filter((file) => manifest[file] !== now[file]);
    expect(stale, 'cards whose text or drawing changed since they were drawn').toEqual([]);
  });

  it('cover every site page and every guide, in every language', async () => {
    const files = Object.keys(await current());
    for (const locale of LOCALES) {
      expect(files).toContain(`${OG_STATIC_DIR}/${locale}/home.png`);
      expect(files).toContain(`${OG_STATIC_DIR}/${locale}/help/local-data.png`);
      expect(files).toContain(`${OG_STATIC_DIR}/${locale}/guides/vesta.png`);
    }
  });

  it('are files under public/, each a 1200x630 PNG, no two alike, and nothing else is there', () => {
    const hashes = new Map<string, string>();
    for (const file of Object.keys(manifest)) {
      const path = join(PUBLIC, file);
      expect(existsSync(path), file).toBe(true);
      const bytes = readFileSync(path);
      expect(imageSize(bytes), file).toEqual(OG_SIZE);
      expect(bytes.readUInt32BE(0), `${file} is a PNG`).toBe(0x89504e47);
      const hash = createHash('sha256').update(bytes).digest('hex');
      expect(hashes.get(hash), `${file} is the same image as ${hashes.get(hash)}`).toBeUndefined();
      hashes.set(hash, file);
    }
    const onDisk = pngsUnder(join(PUBLIC, OG_STATIC_DIR)).map((p) => `/${relative(PUBLIC, p)}`);
    expect(onDisk.sort()).toEqual(Object.keys(manifest).sort());
  });
});
