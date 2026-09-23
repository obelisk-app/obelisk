import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import type { Locale } from '@/i18n';

export interface GuideFrontmatter {
  title: string;
  description: string;
  heroComponent: string;
  publishedAt: string;
  updatedAt: string;
  tags: string[];
  readMinutes?: number;
}

export interface Guide {
  slug: string;
  frontmatter: GuideFrontmatter;
  content: string;
}

const DEFAULT_ROOT = path.join(process.cwd(), 'content', 'guides');

/**
 * What a language falls back to when an article hasn't been translated yet.
 *
 * Without this a locale whose directory is missing or incomplete produces
 * an empty guides index and a 404 per article — the reader gets nothing
 * rather than the English original, which is strictly worse. English is
 * where every article exists first.
 */
const FALLBACK_LOCALE: Locale = 'en';

function rootDir(override?: string) {
  return override || process.env.OBELISK_GUIDES_ROOT || DEFAULT_ROOT;
}

async function slugsIn(locale: Locale, root?: string): Promise<string[]> {
  const dir = path.join(rootDir(root), locale);
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((f) => f.endsWith('.mdx'))
      .map((f) => f.replace(/\.mdx$/, ''))
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

/**
 * Every article available in this language — its own where translated,
 * English where not, so a partially-translated locale lists the full set
 * rather than a subset that looks like the site is missing pages.
 */
export async function listSlugs(locale: Locale, root?: string): Promise<string[]> {
  const own = await slugsIn(locale, root);
  if (locale === FALLBACK_LOCALE) return own;
  const fallback = await slugsIn(FALLBACK_LOCALE, root);
  return [...new Set([...own, ...fallback])].sort();
}

export async function readGuide(
  locale: Locale,
  slug: string,
  root?: string,
): Promise<Guide> {
  const raw = await readRaw(locale, slug, root);
  const { data, content } = matter(raw);
  return {
    slug,
    frontmatter: data as GuideFrontmatter,
    content,
  };
}

/** The article in this language, or the English one when it isn't translated. */
async function readRaw(locale: Locale, slug: string, root?: string): Promise<string> {
  const file = path.join(rootDir(root), locale, `${slug}.mdx`);
  try {
    return await fs.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT' || locale === FALLBACK_LOCALE) throw err;
    return fs.readFile(path.join(rootDir(root), FALLBACK_LOCALE, `${slug}.mdx`), 'utf8');
  }
}

export async function listAllGuides(locale: Locale, root?: string): Promise<Guide[]> {
  const slugs = await listSlugs(locale, root);
  const guides = await Promise.all(slugs.map((slug) => readGuide(locale, slug, root)));
  return guides.sort((a, b) => {
    const ad = a.frontmatter.publishedAt || '';
    const bd = b.frontmatter.publishedAt || '';
    return bd.localeCompare(ad);
  });
}

export function estimateReadMinutes(content: string): number {
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}
