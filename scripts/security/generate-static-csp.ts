/** Build-only: run after next build, before deploying or starting that build. */
import { createHash, randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

export interface StaticCspManifest {
  version: 1;
  buildId: string;
  /** Internal, locale-prefixed Next.js paths, including /en for the English root. */
  routes: Record<string, string[]>;
  fallback: string[];
}

const LOCALES = ['en', 'es', 'pt'];
const PUBLIC_PAGES = ['', '/features', '/desktop', '/mobile', '/media-kit', '/help', '/help/local-data', '/guides'];
const ERROR_HTML = ['app/_not-found.html', 'app/_global-error.html', 'pages/404.html', 'pages/500.html'];

/**
 * Parse trusted compiler output as HTML, never regex-match tag boundaries.
 * JSDOM's defaults execute no scripts and fetch no subresources. textContent
 * preserves script whitespace/entities and performs the same HTML newline
 * normalization as a browser. CSP hashes its UTF-8 text, not tags or attributes:
 * https://www.w3.org/TR/CSP/#match-element-to-source-list
 * Include inert script types (for example JSON-LD) as well, conservatively.
 */
export function hashInlineScripts(html: string): string[] {
  const dom = new JSDOM(html);
  try {
    const hashes = new Set<string>();
    for (const script of dom.window.document.querySelectorAll('script')) {
      if (script.hasAttribute('src')) continue;
      const digest = createHash('sha256').update(script.textContent ?? '', 'utf8').digest('base64');
      hashes.add(`'sha256-${digest}'`);
    }
    return [...hashes].sort();
  } finally {
    dom.window.close();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Refuse missing or regenerating public pages: their runtime bytes cannot use build-time hashes. */
export function publicStaticRoutes(manifest: unknown): string[] {
  if (!isRecord(manifest) || !isRecord(manifest.routes)) {
    throw new Error('Invalid prerender manifest: expected a routes object.');
  }
  const routes = manifest.routes;
  const required = new Set(LOCALES.flatMap((locale) => PUBLIC_PAGES.map((page) => `/${locale}${page}`)));
  // Require locale parity for every concrete guide discovered in this build.
  // Restrict slugs before constructing filesystem paths; do not accept dynamic
  // templates, encoded paths or directory traversal as prerendered guides.
  for (const route of Object.keys(routes)) {
    const guide = /^\/(en|es|pt)\/guides\/(.+)$/.exec(route);
    if (!guide) continue;
    const slug = guide[2];
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error(`Invalid public guide route in prerender manifest: ${route}`);
    }
    for (const locale of LOCALES) required.add(`/${locale}/guides/${slug}`);
  }
  for (const route of required) {
    if (!Object.hasOwn(routes, route)) {
      throw new Error(`Missing required public prerender route: ${route}`);
    }
    const entry = routes[route];
    if (!isRecord(entry) || entry.initialRevalidateSeconds !== false) {
      throw new Error(`Public route ${route} must be immutable (initialRevalidateSeconds: false).`);
    }
  }
  return [...required].sort();
}

async function readRequired(path: string, label: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readOptionalHtml(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return null;
    throw new Error(`Cannot read generated error HTML ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Write only after every route has passed validation and every HTML file was read. */
export async function generateStaticCsp(buildDirectory = '.next'): Promise<StaticCspManifest> {
  const buildDir = resolve(buildDirectory);
  const buildId = (await readRequired(join(buildDir, 'BUILD_ID'), 'BUILD_ID')).trim();
  if (!buildId) throw new Error(`Empty BUILD_ID in ${buildDir}; run next build first.`);
  const manifestPath = join(buildDir, 'prerender-manifest.json');
  const source = await readRequired(manifestPath, 'prerender-manifest.json');
  let prerender: unknown;
  try {
    prerender = JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid prerender-manifest.json at ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const paths = publicStaticRoutes(prerender);
  const routes: Record<string, string[]> = {};
  for (const route of paths) {
    const path = join(buildDir, 'server/app', `${route.slice(1)}.html`);
    const html = await readRequired(path, `prerendered HTML for ${route}`);
    routes[route] = hashInlineScripts(html);
  }
  const fallback = new Set<string>();
  for (const relative of ERROR_HTML) {
    const html = await readOptionalHtml(join(buildDir, 'server', relative));
    if (html === null) continue;
    for (const hash of hashInlineScripts(html)) fallback.add(hash);
  }
  const result: StaticCspManifest = { version: 1, buildId, routes, fallback: [...fallback].sort() };
  const output = join(buildDir, 'server/static-csp.json');
  const temporary = `${output}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  generateStaticCsp(process.argv[2]).then((manifest) => {
    console.log(`Static CSP: ${Object.keys(manifest.routes).length} immutable public routes, ${manifest.fallback.length} error-page hashes (build ${manifest.buildId}).`);
  }).catch((error: unknown) => {
    console.error(`Static CSP manifest generation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
