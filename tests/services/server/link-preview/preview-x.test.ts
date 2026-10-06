import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewX } from '@/services/server/link-preview/preview-x';

/**
 * The preview is cached once per URL and served to readers in every
 * language, so its title carries names only: no "on X", no "Post". The card
 * already labels itself with the site name.
 */

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('previewX', () => {
  it('titles a post with its author and handle', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ text: 'gm', user: { name: 'Ana', screen_name: 'ana' } })));
    const url = 'https://x.com/ana/status/123';
    const preview = await previewX(url, new URL(url));
    expect(preview).toMatchObject({ title: 'Ana (@ana)', siteName: 'X', description: 'gm' });
  });

  it('falls back to the bare author from oEmbed, with no English around it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ html: '<blockquote><p>hello</p></blockquote>', author_name: 'Ana' })));
    const url = 'https://x.com/ana';
    const preview = await previewX(url, new URL(url));
    expect(preview?.title).toBe('Ana');
  });

  it('leaves the title empty rather than inventing one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ html: '<blockquote><p>hello</p></blockquote>' })));
    const url = 'https://x.com/ana';
    const preview = await previewX(url, new URL(url));
    expect(preview?.title).toBeUndefined();
    expect(preview?.description).toBe('hello');
  });
});
