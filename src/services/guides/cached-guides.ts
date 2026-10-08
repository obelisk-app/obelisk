import 'server-only';

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { unstable_cache } from 'next/cache';
import type { Locale } from '@/i18n';
import { listAllGuides, readGuideOrNull } from './guides';

let contentVersion: Promise<string> | undefined;

/** Content addresses the persistent cache, so changed guides invalidate it on deployment. */
async function guideContentVersion(): Promise<string> {
  const root = path.join(process.cwd(), 'content', 'guides');
  const files = (await fs.readdir(root, { recursive: true })).filter((file) => file.endsWith('.mdx')).sort();
  const contents = await Promise.all(files.map(async (file) => [file, await fs.readFile(path.join(root, file), 'utf8')]));
  return createHash('sha256').update(JSON.stringify(contents)).digest('hex');
}

async function cacheVersion(): Promise<string | null> {
  // Local edits and explicit fixture roots must remain visible immediately.
  if (process.env.NODE_ENV !== 'production' || process.env.OBELISK_GUIDES_ROOT) return null;
  contentVersion ??= guideContentVersion().catch((error) => {
    contentVersion = undefined;
    throw error;
  });
  return contentVersion;
}

/** Immutable guide data per content version and locale; request-specific HTML stays uncached. */
export async function cachedGuideList(locale: Locale) {
  const version = await cacheVersion();
  if (!version) return listAllGuides(locale);
  return unstable_cache(listAllGuides, ['guides', 'list', version], { revalidate: false })(locale);
}

/** Metadata, the article and related cards share the same locale/slug data entry. */
export async function cachedGuide(locale: Locale, slug: string) {
  const version = await cacheVersion();
  if (!version) return readGuideOrNull(locale, slug);
  return unstable_cache(readGuideOrNull, ['guides', 'article', version], { revalidate: false })(locale, slug);
}
