import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readGuide, readGuideOrNull } from '@/services/guides/guides';

const root = mkdtempSync(join(tmpdir(), 'guides-'));
mkdirSync(join(root, 'en'));
// Unquoted: YAML reads these as Date objects.
writeFileSync(join(root, 'en', 'plain.mdx'), '---\ntitle: T\ndescription: D\nheroComponent: x\npublishedAt: 2026-04-16\nupdatedAt: 2026-10-06\ntags: []\n---\nBody\n');
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('guide front-matter dates', () => {
  it('come back as YYYY-MM-DD strings even when YAML parsed them as dates', async () => {
    const { frontmatter } = await readGuide('en', 'plain', root);
    expect(frontmatter.publishedAt).toBe('2026-04-16');
    expect(frontmatter.updatedAt).toBe('2026-10-06');
  });

  it('readGuideOrNull: null for a missing or invalid slug, so the page can 404', async () => {
    expect(await readGuideOrNull('en', 'missing', root)).toBeNull();
    expect(await readGuideOrNull('en', '../x', root)).toBeNull();
    expect((await readGuideOrNull('es', 'plain', root))?.frontmatter.title).toBe('T');
  });
});
