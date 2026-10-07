import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useConfirmDialogHost } from '@/hooks/common/useConfirmDialogHost';
import { confirmDialog, settleConfirm } from '@/services/common/confirm-dialog';

describe('useConfirmDialogHost', () => {
  it('follows the pending request and clears once it is answered', async () => {
    const { result } = renderHook(() => useConfirmDialogHost());
    expect(result.current).toBeNull();
    let answer!: Promise<boolean>;
    act(() => { answer = confirmDialog({ title: 'Delete?' }); });
    expect(result.current?.title).toBe('Delete?');
    act(() => settleConfirm(true));
    await expect(answer).resolves.toBe(true);
    expect(result.current).toBeNull();
  });

  it('answers no to a waiting caller when it unmounts', async () => {
    const { unmount } = renderHook(() => useConfirmDialogHost());
    let answer!: Promise<boolean>;
    act(() => { answer = confirmDialog({ title: 'Leave?' }); });
    unmount();
    await expect(answer).resolves.toBe(false);
  });
});
