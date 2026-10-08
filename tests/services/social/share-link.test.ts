import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareOrCopyLink } from '@/services/social/share-link';

afterEach(() => { Object.assign(navigator, { share: undefined, clipboard: undefined }); });

describe('shareOrCopyLink', () => {
  it('reports failure when neither sharing nor clipboard is available', async () => {
    Object.assign(navigator, { share: undefined, clipboard: undefined });
    await expect(shareOrCopyLink({ url: 'u' })).resolves.toBe(false);
  });

  it('uses the share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share });
    await expect(shareOrCopyLink({ url: 'https://x/p/1', title: 'Ana' })).resolves.toBe(true);
    expect(share).toHaveBeenCalledWith({ url: 'https://x/p/1', title: 'Ana' });
  });

  it('copies the url where there is no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share: undefined, clipboard: { writeText } });
    await expect(shareOrCopyLink({ url: 'https://x/n/1' })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://x/n/1');
  });

  it('reports a dismissed sheet as nothing shared', async () => {
    Object.assign(navigator, { share: vi.fn().mockRejectedValue(new Error('AbortError')) });
    await expect(shareOrCopyLink({ url: 'u' })).resolves.toBe(false);
  });
});
