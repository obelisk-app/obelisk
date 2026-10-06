import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES } from '@/i18n';
import { listAssetNames, snapshotPaths, getAssetMeta } from '@/utils/guides/asset-meta';
import { translator } from '@tests/support/intl';

/**
 * Guide heroes and diagrams carry words, so each language has its own
 * snapshot. English keeps the URLs it had before there were languages; the
 * others live one folder down. The PNGs come from `npm run snap-guides`,
 * which nothing runs on build, so a missing one would only show up as a
 * broken preview on a shared Spanish or Portuguese guide.
 */
describe('guide asset snapshots', () => {
  it('keeps English at the top of /og/guides and puts the others in their own folder', () => {
    expect(snapshotPaths('vesta')).toEqual({ svg: '/og/guides/vesta.svg', png: '/og/guides/vesta.png' });
    expect(snapshotPaths('vesta', 'en').png).toBe('/og/guides/vesta.png');
    expect(snapshotPaths('vesta', 'es').png).toBe('/og/guides/es/vesta.png');
    expect(snapshotPaths('vesta', 'pt').svg).toBe('/og/guides/pt/vesta.svg');
  });

  it('has a snapshot on disk for every asset in every language', () => {
    for (const locale of LOCALES) {
      for (const name of listAssetNames()) {
        const { svg, png } = snapshotPaths(name, locale);
        const pngFile = join(process.cwd(), 'public', png);
        expect(existsSync(join(process.cwd(), 'public', svg)), `${svg}: run npm run snap-guides`).toBe(true);
        expect(existsSync(pngFile), `${png}: run npm run snap-guides`).toBe(true);
        expect(readFileSync(pngFile).length).toBeGreaterThan(1000);
      }
    }
  });

  it('describes every asset in every language', () => {
    for (const locale of LOCALES) {
      const t = translator(locale);
      for (const name of listAssetNames()) {
        expect(t(getAssetMeta(name)!.altKey).length, `${locale} ${name}`).toBeGreaterThan(40);
      }
    }
  });

  it('letters the Spanish snapshot in Spanish', () => {
    const svg = readFileSync(join(process.cwd(), 'public', snapshotPaths('run-your-own-relay', 'es').svg), 'utf8');
    expect(svg).toContain('La admisión es una escalera, no un interruptor');
    expect(svg).toContain('BLOQUEADOS');
    expect(svg).not.toContain('BLOCKED');
  });
});
