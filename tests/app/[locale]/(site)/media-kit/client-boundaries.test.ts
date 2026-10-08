import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildImportGraph } from '@tests/support/import-graph';

/** Static brand artwork and content must not ride in the interactive controls' bundle. */
describe('media kit client boundaries', () => {
  const graph = buildImportGraph();
  const clientFiles = new Set<string>();
  const seen = new Set<string>();
  const queue: Array<[string, boolean]> = [['src/app/[locale]/(site)/media-kit/page.tsx', false]];
  while (queue.length) {
    const [file, inherited] = queue.pop()!;
    const client = inherited || /^['"]use client['"];?/m.test(readFileSync(file, 'utf8'));
    const key = `${file}:${client}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (client) clientFiles.add(file);
    for (const next of graph.staticEdges.get(file) ?? []) {
      if (graph.staticEdges.has(next)) queue.push([next, client]);
    }
  }

  it('keeps brand data, embed generation and banner artwork on the server', () => {
    for (const file of [
      'src/constants/media-kit/content.ts',
      'src/utils/media-kit/content.ts',
      'src/app/[locale]/(site)/media-kit/kit/banners.tsx',
    ]) expect(clientFiles.has(file), file).toBe(false);
  });

  it('keeps copying and DOM capture in the browser', () => {
    for (const file of [
      'src/app/[locale]/(site)/media-kit/kit/CopyButton.tsx',
      'src/app/[locale]/(site)/media-kit/kit/BannerCard.tsx',
      'src/app/[locale]/(site)/media-kit/kit/EmbedPreview.tsx',
      'src/hooks/media-kit/kit/usePngDownload.ts',
    ]) expect(clientFiles.has(file), file).toBe(true);
  });
});
