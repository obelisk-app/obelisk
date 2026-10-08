import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_LOCALE, isLocale } from '@/i18n';

interface StaticCspManifest {
  version: 1;
  buildId: string;
  routes: Record<string, string[]>;
  fallback: string[];
}

let manifest: StaticCspManifest | undefined;

function hashes(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((token) => typeof token === 'string' && /^'sha256-[A-Za-z0-9+/]{43}='$/.test(token));
}

/** The immutable build artifact is loaded after compilation, never bundled from an older build. */
function readManifest(): StaticCspManifest {
  if (manifest) return manifest;
  const dir = join(process.cwd(), '.next');
  const parsed = JSON.parse(readFileSync(join(dir, 'server/static-csp.json'), 'utf8')) as StaticCspManifest;
  const buildId = readFileSync(join(dir, 'BUILD_ID'), 'utf8').trim();
  if (parsed.version !== 1 || parsed.buildId !== buildId || !hashes(parsed.fallback) || !parsed.routes || Array.isArray(parsed.routes)) {
    throw new Error('Invalid or stale static CSP manifest. Run npm run build before starting the server.');
  }
  for (const [path, tokens] of Object.entries(parsed.routes)) {
    if (!path.startsWith('/') || !hashes(tokens) || tokens.length === 0) throw new Error('Invalid static CSP route entry.');
  }
  manifest = parsed;
  return manifest;
}

/** Exact prerendered route lookup, matching next-intl's default-locale rewrite. */
export function staticPagePolicy(pathname: string): { hashes: string[] | null; fallback: string[] } {
  const data = readManifest();
  let decoded: string;
  try { decoded = decodeURI(pathname); } catch { return { hashes: null, fallback: data.fallback }; }
  const parts = decoded.split('/').filter(Boolean);
  const locale = isLocale(parts[0]) ? parts.shift()! : DEFAULT_LOCALE;
  const path = `/${locale}${parts.length ? `/${parts.join('/')}` : ''}`;
  return { hashes: Object.hasOwn(data.routes, path) ? data.routes[path] : null, fallback: data.fallback };
}
