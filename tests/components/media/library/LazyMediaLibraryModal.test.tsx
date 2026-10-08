import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { buildImportGraph, staticClosure } from '@tests/support/import-graph';
import LazyMediaLibraryModal from '@/components/media/library/LazyMediaLibraryModal';

const loading = vi.hoisted(() => ({ count: 0, release: () => {} }));
vi.mock('@/components/media/library/MediaLibraryModal', async () => {
  loading.count += 1;
  await new Promise<void>((resolve) => { loading.release = resolve; });
  return { default: ({ initialTab, initialKind, embedded }: { initialTab: string; initialKind: string; embedded: boolean }) => (
    <div data-testid="loaded-library">{initialTab}:{initialKind}:{String(embedded)}</div>
  ) };
});

describe('media library loading boundary', () => {
  it('loads on opening, keeps loading dismissible, supports embedded settings and forwards initial options', async () => {
    const onClose = vi.fn();
    const host = (open: boolean, embedded = false) => <LocaleProvider initialLocale="en">{open && <LazyMediaLibraryModal onClose={onClose} initialTab="favorites" initialKind="gif" embedded={embedded} />}</LocaleProvider>;
    const view = render(host(false));
    expect(loading.count).toBe(0);
    view.rerender(host(true));
    expect(screen.getByTestId('media-library-modal')).toContainElement(screen.getByTestId('media-library-loading'));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
    view.rerender(host(true, true));
    expect(screen.queryByTestId('media-library-modal')).toBeNull();
    expect(screen.getByTestId('media-library-embedded')).toContainElement(screen.getByTestId('media-library-loading'));
    await vi.waitFor(() => expect(loading.count).toBe(1));
    await act(async () => { loading.release(); });
    expect(await screen.findByTestId('loaded-library')).toHaveTextContent('favorites:gif:true');
  });
  it('has no eager bypass through settings, gallery, sticker, picker or relay administration', () => {
    const graph = buildImportGraph();
    const target = 'src/components/media/library/MediaLibraryModal.tsx';
    for (const shell of ['desktop/DesktopShell', 'mobile/PhoneShell']) {
      expect(staticClosure(graph, `src/app/[locale]/app/${shell}.tsx`).has(target)).toBe(false);
    }
    expect([...graph.staticEdges].filter(([, edges]) => edges.includes(target))).toEqual([]);
    expect(graph.dynamicEdges.get('src/components/media/library/LazyMediaLibraryModal.tsx')).toContain(target);
  });
});
