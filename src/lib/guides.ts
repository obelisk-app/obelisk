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

function rootDir(override?: string) {
  return override || process.env.OBELISK_GUIDES_ROOT || DEFAULT_ROOT;
}

export async function listSlugs(locale: Locale, root?: string): Promise<string[]> {
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

export async function readGuide(
  locale: Locale,
  slug: string,
  root?: string,
): Promise<Guide> {
  const file = path.join(rootDir(root), locale, `${slug}.mdx`);
  const raw = await fs.readFile(file, 'utf8');
  const { data, content } = matter(raw);
  return {
    slug,
    frontmatter: data as GuideFrontmatter,
    content,
  };
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
