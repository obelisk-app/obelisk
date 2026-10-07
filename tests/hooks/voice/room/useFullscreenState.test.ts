/**
 * Tests for the fullscreen-state hook. jsdom doesn't implement the Fullscreen
 * API natively so we install minimal stubs on Document + Element and
 * exercise the toggle paths.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFullscreenState } from '@/hooks/voice/room/useFullscreenState';

interface DocStub {
  fullscreenElement: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => void;
}

let docStub: DocStub;

beforeEach(() => {
  docStub = {
    fullscreenElement: null,
  };
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => docStub.fullscreenElement,
  });
  Object.defineProperty(document, 'webkitFullscreenElement', {
    configurable: true,
    get: () => docStub.webkitFullscreenElement,
  });
  document.exitFullscreen = vi.fn(async () => {
    docStub.fullscreenElement = null;
    document.dispatchEvent(new Event('fullscreenchange'));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useFullscreenState', () => {
  it('returns false when no element is fullscreen', () => {
    const el = document.createElement('div');
    const ref = { current: el };
    const { result } = renderHook(() => useFullscreenState(ref));
    expect(result.current).toBe(false);
  });

  it('flips true when fullscreenchange fires with the watched element', () => {
    const el = document.createElement('div');
    const ref = { current: el };
    const { result } = renderHook(() => useFullscreenState(ref));
    expect(result.current).toBe(false);

    act(() => {
      docStub.fullscreenElement = el;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current).toBe(true);

    act(() => {
      docStub.fullscreenElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current).toBe(false);
  });

  it('stays false when a different element is fullscreen', () => {
    const watched = document.createElement('div');
    const other = document.createElement('div');
    const ref = { current: watched };
    const { result } = renderHook(() => useFullscreenState(ref));

    act(() => {
      docStub.fullscreenElement = other;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current).toBe(false);
  });

  it('listens to webkitfullscreenchange too', () => {
    const el = document.createElement('div');
    const ref = { current: el };
    const { result } = renderHook(() => useFullscreenState(ref));

    act(() => {
      docStub.webkitFullscreenElement = el;
      document.dispatchEvent(new Event('webkitfullscreenchange'));
    });
    expect(result.current).toBe(true);
  });
});
