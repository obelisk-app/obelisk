import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';

const publishDelete = vi.hoisted(() => vi.fn());
vi.mock('@/services/social/publish', () => ({ publishDelete }));

import { useToastStore } from '@/store/feedback/toast';
import { deleteNoteWithToast } from '@/services/social/delete-note';

const NOTE = { id: 'a', pubkey: 'b', kind: 1, content: '', created_at: 1, sig: '', tags: [] } as NostrEvent;
const t = ((key: string) => key) as never;

beforeEach(() => {
  publishDelete.mockReset();
  useToastStore.getState().clearToasts();
});

describe('deleteNoteWithToast', () => {
  it('publishes the deletion, confirms it and tells the host', async () => {
    publishDelete.mockResolvedValue({});
    const onDeleted = vi.fn();
    await deleteNoteWithToast(NOTE, t, onDeleted);
    expect(publishDelete).toHaveBeenCalledWith(NOTE);
    expect(useToastStore.getState().toasts.at(-1)?.title).toBe('social.deleteRequested');
    expect(onDeleted).toHaveBeenCalled();
  });

  it('reports a failure and leaves the host alone', async () => {
    publishDelete.mockRejectedValue(new Error('no'));
    const onDeleted = vi.fn();
    await deleteNoteWithToast(NOTE, t, onDeleted);
    expect(useToastStore.getState().toasts.at(-1)?.title).toBe('social.actionFailed');
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
