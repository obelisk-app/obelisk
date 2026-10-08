import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const image = vi.hoisted(() => ({ loads: 0, toPng: vi.fn() }));
const toPng = image.toPng;
vi.mock('html-to-image', () => {
  image.loads++;
  return { toPng: image.toPng };
});

import { usePngDownload } from '@/hooks/media-kit/kit/usePngDownload';

function nodeOfWidth(width: number) {
  const node = document.createElement('div');
  node.getBoundingClientRect = () => ({ width } as DOMRect);
  return node;
}

describe('usePngDownload', () => {
  it('does not load the rasterizer merely to display an export control', () => {
    const { result } = renderHook(() => usePngDownload({ current: nodeOfWidth(300) }, 'preview.png'));
    expect(result.current.busy).toBe(false);
    expect(image.loads).toBe(0);
  });

  it('upscales to the export width and downloads under the given name', async () => {
    toPng.mockResolvedValueOnce('data:image/png;base64,AAAA');
    const clicks: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    });
    const ref = { current: nodeOfWidth(300) };
    const { result } = renderHook(() => usePngDownload(ref, 'banner.png', 1200));
    await act(async () => { await result.current.download(); });
    expect(toPng).toHaveBeenCalledWith(ref.current, expect.objectContaining({ pixelRatio: 4, backgroundColor: '#0a0a0a' }));
    expect(clicks).toEqual(['banner.png']);
    expect(result.current.busy).toBe(false);
    click.mockRestore();
  });

  it('renders at 2x without an export width, and never below 1x', async () => {
    toPng.mockResolvedValue('data:,');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { result: plain } = renderHook(() => usePngDownload({ current: nodeOfWidth(300) }, 'a.png'));
    await act(async () => { await plain.current.download(); });
    expect(toPng.mock.lastCall?.[1]).toMatchObject({ pixelRatio: 2 });
    const { result: small } = renderHook(() => usePngDownload({ current: nodeOfWidth(2000) }, 'b.png', 600));
    await act(async () => { await small.current.download(); });
    expect(toPng.mock.lastCall?.[1]).toMatchObject({ pixelRatio: 1 });
    click.mockRestore();
  });

  it('is busy only while rendering, even when rendering fails', async () => {
    toPng.mockRejectedValueOnce(new Error('canvas tainted'));
    const { result } = renderHook(() => usePngDownload({ current: nodeOfWidth(100) }, 'c.png'));
    await act(async () => { await result.current.download().catch(() => {}); });
    expect(result.current.busy).toBe(false);
  });
});
