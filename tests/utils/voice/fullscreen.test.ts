/**
 * Tests for the fullscreen helper. jsdom doesn't implement the Fullscreen
 * API natively so we install minimal stubs on Document + Element and
 * exercise the toggle paths.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toggleFullscreen } from '@/utils/voice/fullscreen';

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

describe('toggleFullscreen', () => {
  it('calls requestFullscreen when no element is currently fullscreen', async () => {
    const el = document.createElement('div');
    const req = vi.fn(async () => {
      docStub.fullscreenElement = el;
    });
    (el as unknown as { requestFullscreen: () => Promise<void> }).requestFullscreen = req;

    await toggleFullscreen(el);
    expect(req).toHaveBeenCalled();
    expect(docStub.fullscreenElement).toBe(el);
  });

  it('calls exitFullscreen when something is already fullscreen', async () => {
    const existing = document.createElement('div');
    docStub.fullscreenElement = existing;
    const el = document.createElement('div');

    await toggleFullscreen(el);
    expect(document.exitFullscreen).toHaveBeenCalled();
    expect(docStub.fullscreenElement).toBeNull();
  });

  it('falls back to webkitRequestFullscreen if standard API is missing', async () => {
    const el = document.createElement('div');
    const req = vi.fn(() => {
      docStub.webkitFullscreenElement = el;
    });
    (el as unknown as { webkitRequestFullscreen: () => void }).webkitRequestFullscreen = req;

    await toggleFullscreen(el);
    expect(req).toHaveBeenCalled();
  });

  it('no-ops on a null element', async () => {
    await expect(toggleFullscreen(null)).resolves.toBeUndefined();
  });
});
