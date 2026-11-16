import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useConcordAttachment } from '@/hooks/chat/concord/useConcordAttachment';
import type { MediaAttachment } from '@applesauce/concord/helpers';

vi.mock('@/services/chat/concord/media', () => ({ readConcordAttachment: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])), downloadConcordAttachment: vi.fn() }));

it('decrypts a stable attachment once and revokes its plaintext blob when unmounted', async () => {
  const { readConcordAttachment } = await import('@/services/chat/concord/media');
  const create = vi.fn().mockReturnValue('blob:private-media');
  const revoke = vi.fn();
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = create;
  URL.revokeObjectURL = revoke;
  try {
    const file = { url: 'https://files.example/encrypted.bin', type: 'image/png' } as MediaAttachment;
    const { result, rerender, unmount } = renderHook(({ attachment }) => useConcordAttachment(attachment), { initialProps: { attachment: file } });
    await waitFor(() => expect(result.current.url).toBe('blob:private-media'));
    await act(async () => rerender({ attachment: { ...file } }));
    expect(readConcordAttachment).toHaveBeenCalledTimes(1);
    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:private-media');
  } finally { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; }
});
