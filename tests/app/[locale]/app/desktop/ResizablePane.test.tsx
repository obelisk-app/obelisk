import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResizablePane } from '@/app/[locale]/app/desktop/ResizablePane';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';

const KEY = 'test/pane-width';

function paneWidth(): string {
  return screen.getByTestId('pane-body').parentElement!.style.getPropertyValue('--pane-w');
}

function renderPane(props: Partial<Parameters<typeof ResizablePane>[0]> = {}) {
  return renderWithBridge(
    <ResizablePane storageKey={KEY} defaultWidth={260} min={200} max={400} {...props}>
      <div data-testid="pane-body" />
    </ResizablePane>,
    fakeBridge(),
  );
}

function drag(fromX: number, toX: number) {
  fireEvent.mouseDown(screen.getByTitle('Drag to resize'), { clientX: fromX });
  fireEvent.mouseMove(window, { clientX: toX });
  fireEvent.mouseUp(window, { clientX: toX });
}

describe('ResizablePane', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts at the stored width, clamped to the range, or the default', () => {
    renderPane();
    expect(paneWidth()).toBe('260px');
  });

  it('clamps a stored width into the range', () => {
    window.localStorage.setItem(KEY, '9000');
    renderPane();
    expect(paneWidth()).toBe('400px');
  });

  it('ignores a stored value that is not a number', () => {
    window.localStorage.setItem(KEY, 'wide');
    renderPane();
    expect(paneWidth()).toBe('260px');
  });

  it('widens to the right as the handle is dragged right, within the range, and reports it', () => {
    const onWidthChange = vi.fn();
    renderPane({ onWidthChange });
    drag(100, 150);
    expect(paneWidth()).toBe('310px');
    expect(onWidthChange).toHaveBeenLastCalledWith(310);
    drag(100, 900);
    expect(paneWidth()).toBe('400px');
  });

  it('a left-side pane widens as the handle is dragged left', () => {
    renderPane({ side: 'left' });
    drag(500, 460);
    expect(paneWidth()).toBe('300px');
  });

  it('remembers the dragged width, not the width the drag started from', () => {
    renderPane();
    drag(100, 150);
    expect(window.localStorage.getItem(KEY)).toBe('310');
  });
});
