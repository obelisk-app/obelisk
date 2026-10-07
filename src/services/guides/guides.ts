import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import type { Locale } from '@/i18n';

export interface GuideFrontmatter {
  title: string;
  /** The lede under the title, on the page and on its card. */
  description: string;
  /** What a search result shows, when the title alone is too short or too long for one. */
  seoTitle?: string;
  /** About 70 to 160 characters: the description cut to what a search result shows. */
  seoDescription?: string;
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
 * an empty guides index and a 404 per article: the reader gets nothing
 * rather than the English original, which is strictly worse. English is
 * where every article exists first.
 */
const FALLBACK_LOCALE: Locale = 'en';

/**
 * A slug is a filename fragment, so it must not be able to leave its folder.
 *
 * `readGuide` is reached from a dynamic route segment, and the slug was
 * interpolated straight into `path.join(root, locale, `${slug}.mdx`)`. Next
 * decodes `%2e%2e%2f` before the segment arrives, so `../../../` reached the
 * join intact and the reader could name any `.mdx` file on the machine. Only
 * repo files exist there today, which is why this was harmless in practice
 * and worth fixing anyway: the guard belongs next to the join, not in a
 * caller that a later route might forget.
 *
 * Deliberately an allow-list. Blocking `..` is the version that gets bypassed.
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertSlug(slug: string): string {
  if (!SLUG.test(slug)) throw new Error(`Invalid guide slug: ${JSON.stringify(slug)}`); // i18n-exempt: developer error, never shown (every caller catches it and 404s)
  return slug;
}

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
 * Every article available in this language: its own where translated,
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
    frontmatter: { ...data, publishedAt: dateField(data.publishedAt), updatedAt: dateField(data.updatedAt) } as GuideFrontmatter,
    content,
  };
}

/**
 * Front-matter dates as `YYYY-MM-DD` strings. Quoted dates arrive as
 * strings; an unquoted `2026-10-06` is parsed by YAML into a Date, which
 * would otherwise reach the sitemap and JSON-LD as a full timestamp.
 */
function dateField(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === 'string' ? value : '';
}

/** The article in this language, or the English one when it isn't translated. */
async function readRaw(locale: Locale, slug: string, root?: string): Promise<string> {
  const safe = assertSlug(slug);
  const file = path.join(rootDir(root), locale, `${safe}.mdx`);
  try {
    return await fs.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT' || locale === FALLBACK_LOCALE) throw err;
    return fs.readFile(path.join(rootDir(root), FALLBACK_LOCALE, `${safe}.mdx`), 'utf8');
  }
}

/** The guide, or null when the slug is invalid or no file exists (the caller 404s). */
export async function readGuideOrNull(locale: Locale, slug: string, root?: string): Promise<Guide | null> {
  try {
    return await readGuide(locale, slug, root);
  } catch {
    return null;
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
