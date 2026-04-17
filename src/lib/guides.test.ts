import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { listSlugs, readGuide, listAllGuides, estimateReadMinutes } from './guides';

const FIXTURES = path.join(process.cwd(), 'src', 'test', 'fixtures', 'guides');

describe('guides lib', () => {
  it('listSlugs returns sorted mdx slugs for a locale', async () => {
    const slugs = await listSlugs('en', FIXTURES);
    expect(slugs).toEqual(['alpha', 'beta']);
  });

  it('listSlugs returns [] when locale directory is missing', async () => {
    const slugs = await listSlugs('en', path.join(FIXTURES, '__missing__'));
    expect(slugs).toEqual([]);
  });

  it('readGuide parses frontmatter and content', async () => {
    const guide = await readGuide('en', 'alpha', FIXTURES);
    expect(guide.slug).toBe('alpha');
    expect(guide.frontmatter.title).toBe('Alpha');
    expect(guide.frontmatter.heroComponent).toBe('wot');
    expect(guide.frontmatter.tags).toEqual(['test', 'alpha']);
    expect(guide.content).toContain('Alpha body');
  });

  it('readGuide works across locales', async () => {
    const guide = await readGuide('es', 'alpha', FIXTURES);
    expect(guide.frontmatter.title).toBe('Alfa');
    expect(guide.content).toContain('Cuerpo de alfa');
  });

  it('listAllGuides orders by publishedAt desc', async () => {
    const all = await listAllGuides('en', FIXTURES);
    expect(all.map((g) => g.slug)).toEqual(['beta', 'alpha']);
  });

  it('estimateReadMinutes returns at least 1 minute', () => {
    expect(estimateReadMinutes('')).toBe(1);
    expect(estimateReadMinutes('word '.repeat(500))).toBeGreaterThanOrEqual(2);
  });
});
