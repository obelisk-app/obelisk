import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import nextConfig from '../../../next.config';

/**
 * Nothing under `src/app/dev/` may become a route in a built site.
 *
 * These are development harnesses — the screenshot rig the game guides are
 * photographed from, and whatever comes after it. They mount real app
 * components with fixture data, which is exactly the sort of thing that should
 * never answer a request in production. The mechanism is `pageExtensions`:
 * `dev.tsx` is only in the list while `next dev` is running, so these files are
 * not routes anywhere else. A `page.tsx` in here would quietly undo that.
 */
const DEV_DIR = join(process.cwd(), 'src', 'app', 'dev');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

describe('src/app/dev', () => {
  it('is not routable outside `next dev`', () => {
    // Vitest runs with NODE_ENV=test, i.e. the production branch of the config.
    expect(process.env.NODE_ENV).not.toBe('development');
    expect(nextConfig.pageExtensions).toBeDefined();
    expect(nextConfig.pageExtensions).not.toContain('dev.tsx');
  });

  it('declares its pages with the dev-only extension', () => {
    const files = walk(DEV_DIR).map((f) => f.slice(DEV_DIR.length + 1));
    const routeFiles = files.filter((f) => /(^|\/)(page|route|layout|default)\.[jt]sx?$/.test(f));
    expect(routeFiles, `these would ship as routes: ${routeFiles.join(', ')}`).toEqual([]);
    // …and there is still a harness in here, or this test is guarding nothing.
    expect(files.some((f) => f.endsWith('page.dev.tsx'))).toBe(true);
  });
});
