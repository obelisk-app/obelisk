// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateStaticCsp, hashInlineScripts, publicStaticRoutes } from './generate-static-csp';

const locales = ['en', 'es', 'pt'];
const pages = ['', '/features', '/desktop', '/mobile', '/media-kit', '/help', '/help/local-data', '/guides'];
const token = (text: string) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
const routes = () => Object.fromEntries(locales.flatMap((locale) => pages.map((page) => [
  `/${locale}${page}`, { initialRevalidateSeconds: false },
])));
const dirs: string[] = [];

async function fixture(extra: Record<string, unknown> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'obelisk-static-csp-'));
  dirs.push(dir);
  const manifest = { version: 4, routes: { ...routes(), ...extra }, dynamicRoutes: {} };
  await writeFile(join(dir, 'BUILD_ID'), 'fixture-build\n');
  await writeFile(join(dir, 'prerender-manifest.json'), JSON.stringify(manifest));
  for (const route of Object.keys(manifest.routes)) {
    const path = join(dir, 'server/app', `${route.slice(1)}.html`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `<html><script>self.__next_f.push([1,${JSON.stringify(route)}])</script></html>`);
  }
  return { dir, manifest };
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('inline script hashes', () => {
  it('preserves whitespace, Unicode and Next RSC text without executing it', () => {
    const text = '\n self.__next_f.push([1,"Olá &amp; <tag> 🗝"]); \n';
    expect(hashInlineScripts(`<script nonce="ignored" data-value=">">${text}</script>`)).toEqual([token(text)]);
    expect(hashInlineScripts('<script>throw new Error("must not execute")</script>')).toEqual([
      token('throw new Error("must not execute")'),
    ]);
    expect(hashInlineScripts('<script> alert(1); </script>')).not.toEqual(hashInlineScripts('<script>alert(1);</script>'));
  });

  it('uses HTML parsing for attributes, comments and raw script contents', () => {
    const json = '{"@type":"FAQPage","text":"<script data-x=\\"x\\"> &amp;"}';
    const html = `<!-- <script>comment</script> -->
      <SCRIPT SRC='/external.js'>ignored()</SCRIPT>
      <script src>alsoIgnored()</script>
      <script src="">emptySrc()</script>
      <script data-src="/not-an-external-script">inline()</script>
      <script type="application/ld+json">${json}</script>
      <script type="module">moduleCode()</script>`;
    expect(hashInlineScripts(html)).toEqual([token('inline()'), token(json), token('moduleCode()')].sort());
  });

  it('deduplicates identical scripts and hashes browser-normalized newlines', () => {
    expect(hashInlineScripts('<script>one()</script><script>one()</script><script>two()\r\n</script>'))
      .toEqual([token('one()'), token('two()\n')].sort());
    expect(hashInlineScripts('<html><body>No script</body></html>')).toEqual([]);
  });
});

describe('public prerender route validation', () => {
  it('selects internal locale routes and ignores live viewers, app pages and metadata', () => {
    const manifest = { routes: {
      ...routes(),
      '/en/app': { initialRevalidateSeconds: 0 },
      '/en/notes/abc': { initialRevalidateSeconds: 60 },
      '/en/og/hashtag/foo': { initialRevalidateSeconds: 3600 },
      '/sitemap.xml': { initialRevalidateSeconds: false },
    } };
    expect(publicStaticRoutes(manifest)).toEqual(Object.keys(routes()).sort());
  });

  it.each([0, 60, true, undefined, 'false'])('rejects required routes with revalidation %s', (revalidate) => {
    const manifest = { routes: { ...routes(), '/es/features': { initialRevalidateSeconds: revalidate } } };
    expect(() => publicStaticRoutes(manifest)).toThrow('/es/features');
  });

  it('rejects missing base pages and invalid manifest shapes', () => {
    const missing = routes();
    delete missing['/pt/help/local-data'];
    expect(() => publicStaticRoutes({ routes: missing })).toThrow('/pt/help/local-data');
    for (const manifest of [null, {}, { routes: [] }, { routes: null }]) {
      expect(() => publicStaticRoutes(manifest)).toThrow(/prerender manifest/i);
    }
  });

  it.each(['../private', '%2e%2e', '[slug]'])('rejects unsafe or unresolved guide paths: %s', (slug) => {
    expect(() => publicStaticRoutes({ routes: {
      ...routes(), [`/en/guides/${slug}`]: { initialRevalidateSeconds: false },
    } })).toThrow(/Invalid public guide route/);
  });

  it('requires every discovered guide to be immutable in every locale', () => {
    const guides: Record<string, { initialRevalidateSeconds: boolean | number }> = Object.fromEntries(locales.map((locale) => [`/${locale}/guides/example`, { initialRevalidateSeconds: false }]));
    expect(publicStaticRoutes({ routes: { ...routes(), ...guides } })).toContain('/en/guides/example');
    delete guides['/pt/guides/example'];
    expect(() => publicStaticRoutes({ routes: { ...routes(), ...guides } })).toThrow('/pt/guides/example');
    guides['/pt/guides/example'] = { initialRevalidateSeconds: 30 };
    expect(() => publicStaticRoutes({ routes: { ...routes(), ...guides } })).toThrow(/immutable.*\/pt\/guides\/example|\/pt\/guides\/example.*immutable/i);
  });
});

describe('build manifest generation', () => {
  it('writes versioned route hashes and the generated 404/500 hashes atomically', async () => {
    const { dir } = await fixture();
    for (const path of ['app/_not-found.html', 'app/_global-error.html', 'pages/404.html', 'pages/500.html']) {
      await mkdir(dirname(join(dir, 'server', path)), { recursive: true });
      await writeFile(join(dir, 'server', path), `<script>${path.includes('404') || path.includes('not-found') ? 'notFound()' : 'errorPage()'}</script>`);
    }
    const result = await generateStaticCsp(dir);
    expect(result.version).toBe(1);
    expect(result.buildId).toBe('fixture-build');
    expect(Object.keys(result.routes)).toHaveLength(24);
    expect(result.routes['/en']).toEqual([token('self.__next_f.push([1,"/en"])')]);
    expect(result.routes['/pt/help/local-data']).toEqual([token('self.__next_f.push([1,"/pt/help/local-data"])')]);
    expect(result.fallback).toEqual([token('notFound()'), token('errorPage()')].sort());
    expect(JSON.parse(await readFile(join(dir, 'server/static-csp.json'), 'utf8'))).toEqual(result);
    expect((await readdir(join(dir, 'server'))).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('permits absent generated error pages without fabricating fallback hashes', async () => {
    const { dir } = await fixture();
    expect((await generateStaticCsp(dir)).fallback).toEqual([]);
  });

  it('rejects missing HTML instead of publishing a partial replacement', async () => {
    const { dir } = await fixture();
    await writeFile(join(dir, 'server/static-csp.json'), 'previous-manifest');
    await rm(join(dir, 'server/app/es/features.html'));
    await expect(generateStaticCsp(dir)).rejects.toThrow(/\/es\/features.*HTML|HTML.*\/es\/features/);
    expect(await readFile(join(dir, 'server/static-csp.json'), 'utf8')).toBe('previous-manifest');
    expect((await readdir(join(dir, 'server'))).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('does not treat unreadable error HTML as an absent fallback', async () => {
    const { dir } = await fixture();
    await mkdir(join(dir, 'server/app/_not-found.html'));
    await expect(generateStaticCsp(dir)).rejects.toThrow(/generated error HTML/);
  });

  it('cleans its temporary file when the atomic rename cannot replace the destination', async () => {
    const { dir } = await fixture();
    await mkdir(join(dir, 'server/static-csp.json'));
    await expect(generateStaticCsp(dir)).rejects.toThrow();
    expect((await readdir(join(dir, 'server'))).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('rejects a missing or blank build ID and malformed prerender JSON', async () => {
    const { dir } = await fixture();
    await writeFile(join(dir, 'BUILD_ID'), '\n');
    await expect(generateStaticCsp(dir)).rejects.toThrow(/BUILD_ID/);
    await rm(join(dir, 'BUILD_ID'));
    await expect(generateStaticCsp(dir)).rejects.toThrow(/BUILD_ID/);
    await writeFile(join(dir, 'BUILD_ID'), 'id');
    await writeFile(join(dir, 'prerender-manifest.json'), '{broken');
    await expect(generateStaticCsp(dir)).rejects.toThrow(/prerender-manifest/);
  });
});
