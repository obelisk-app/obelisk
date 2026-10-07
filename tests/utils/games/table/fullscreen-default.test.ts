import { afterEach, describe, expect, it, vi } from 'vitest';
import { FULLSCREEN_BELOW_PX, opensFullscreen } from '@/utils/games/table/fullscreen-default';

describe('opensFullscreen', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('opens a phone-width window fullscreen and a desktop one as a dialog', () => {
    vi.stubGlobal('innerWidth', FULLSCREEN_BELOW_PX - 1);
    expect(opensFullscreen()).toBe(true);
    vi.stubGlobal('innerWidth', FULLSCREEN_BELOW_PX);
    expect(opensFullscreen()).toBe(false);
  });
});
