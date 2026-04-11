import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setBadgeCount,
  clearBadge,
  formatBadgeLabel,
  __resetFaviconBadgeForTests,
} from './favicon-badge';

/**
 * jsdom's <canvas> returns `null` from getContext by default — we stub it
 * with a tiny fake that records the calls we care about. Each test gets a
 * fresh spy + DOM state.
 */
function installCanvasStub() {
  const drawCalls: string[] = [];
  const fakeCtx: any = {
    clearRect: vi.fn(() => drawCalls.push('clearRect')),
    drawImage: vi.fn(() => drawCalls.push('drawImage')),
    beginPath: vi.fn(),
    arc: vi.fn(() => drawCalls.push('arc')),
    fill: vi.fn(() => drawCalls.push('fill')),
    stroke: vi.fn(),
    fillText: vi.fn((txt: string) => drawCalls.push(`fillText:${txt}`)),
    set fillStyle(_v: string) {},
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set font(_v: string) {},
    set textAlign(_v: string) {},
    set textBaseline(_v: string) {},
  };
  HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCtx) as any;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,STUB') as any;
  return { fakeCtx, drawCalls };
}

/**
 * jsdom doesn't implement image loading — we intercept Image so setting
 * `.src` immediately fires `onload`. Without this, `loadBaseIcon()` hangs.
 */
function installImageStub() {
  class StubImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    crossOrigin = '';
    private _src = '';
    set src(v: string) {
      this._src = v;
      // Fire onload asynchronously so callers have time to attach handlers.
      queueMicrotask(() => this.onload?.());
    }
    get src() {
      return this._src;
    }
  }
  (globalThis as any).Image = StubImage;
}

describe('formatBadgeLabel', () => {
  it('returns empty string for zero or negative', () => {
    expect(formatBadgeLabel(0)).toBe('');
    expect(formatBadgeLabel(-3)).toBe('');
  });
  it('returns stringified number for 1–99', () => {
    expect(formatBadgeLabel(1)).toBe('1');
    expect(formatBadgeLabel(42)).toBe('42');
    expect(formatBadgeLabel(99)).toBe('99');
  });
  it('returns 99+ for counts over 99', () => {
    expect(formatBadgeLabel(100)).toBe('99+');
    expect(formatBadgeLabel(10_000)).toBe('99+');
  });
  it('floors non-integers', () => {
    expect(formatBadgeLabel(7.9)).toBe('7');
  });
});

describe('setBadgeCount', () => {
  beforeEach(() => {
    __resetFaviconBadgeForTests();
    document.head.innerHTML = '';
    installCanvasStub();
    installImageStub();
  });

  it('creates a <link rel="icon"> if none exists', async () => {
    await setBadgeCount(3);
    const link = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
    expect(link).toBeTruthy();
    expect(link.href).toContain('data:image/png');
  });

  it('replaces the href of an existing favicon link', async () => {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = '/favicon.ico';
    document.head.appendChild(link);

    await setBadgeCount(5);
    expect(link.href).toContain('data:image/png;base64,STUB');
  });

  it('draws the badge label onto the canvas', async () => {
    const { drawCalls } = installCanvasStub();
    __resetFaviconBadgeForTests();

    await setBadgeCount(7);
    expect(drawCalls).toContain('fillText:7');
    expect(drawCalls).toContain('arc');
    expect(drawCalls).toContain('fill');
  });

  it('uses 99+ label for large counts', async () => {
    const { drawCalls } = installCanvasStub();
    __resetFaviconBadgeForTests();

    await setBadgeCount(250);
    expect(drawCalls).toContain('fillText:99+');
  });

  it('is a no-op on repeated calls with the same count', async () => {
    const { fakeCtx } = installCanvasStub();
    __resetFaviconBadgeForTests();

    await setBadgeCount(4);
    const firstFillCalls = (fakeCtx.fillText as any).mock.calls.length;
    await setBadgeCount(4);
    const secondFillCalls = (fakeCtx.fillText as any).mock.calls.length;
    expect(secondFillCalls).toBe(firstFillCalls);
  });

  it('clears the badge when count is 0', async () => {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = '/favicon.ico';
    document.head.appendChild(link);

    await setBadgeCount(3);
    expect(link.href).toContain('data:image/png');

    await setBadgeCount(0);
    expect(link.href).toContain('/favicon.ico');
  });
});

describe('clearBadge', () => {
  beforeEach(() => {
    __resetFaviconBadgeForTests();
    document.head.innerHTML = '';
    installCanvasStub();
    installImageStub();
  });

  it('restores the original favicon href', async () => {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = 'https://example.test/custom.png';
    document.head.appendChild(link);

    await setBadgeCount(2);
    expect(link.href).toContain('data:image/png');

    await clearBadge();
    expect(link.href).toBe('https://example.test/custom.png');
  });
});
