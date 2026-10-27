import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useFloatingUserPanel } from '@/hooks/shell/panes/sidebar/useFloatingUserPanel';

const VAR = '--floating-user-panel-clearance';

function rect(top: number, bottom: number): DOMRect {
  return { top, bottom, height: bottom - top, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
}

function Panel() {
  const ref = useFloatingUserPanel();
  return <div ref={ref} data-testid="panel" />;
}

/** Mounts the panel inside an 800px-tall shell, which is what it measures against. */
function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  host.getBoundingClientRect = () => rect(0, 800);
  render(<Panel />, { container: host });
  return host;
}

const observers: Array<{ cb: () => void }> = [];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  observers.length = 0;
  document.body.innerHTML = '';
});

function stubPanelRect(get: () => DOMRect) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.testid === 'panel') return get();
    return rect(0, 800);
  });
}

describe('useFloatingUserPanel', () => {
  it('publishes the area the panel covers (its top to the shell bottom) on the shell', () => {
    stubPanelRect(() => rect(712, 788));
    const host = mount();
    expect(host.style.getPropertyValue(VAR)).toBe('88px');
  });

  it('re-measures when the panel grows, as when a call bar appears above the pill', () => {
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: () => void) { observers.push({ cb }); }
      observe() {}
      disconnect() {}
    });
    let top = 712;
    stubPanelRect(() => rect(top, 788));
    const host = mount();
    expect(host.style.getPropertyValue(VAR)).toBe('88px');
    top = 600;
    act(() => observers.forEach((o) => o.cb()));
    expect(host.style.getPropertyValue(VAR)).toBe('200px');
  });

  it('sets nothing while the panel is hidden, so the list keeps its fallback', () => {
    stubPanelRect(() => rect(0, 0));
    const host = mount();
    expect(host.style.getPropertyValue(VAR)).toBe('');
  });
});
