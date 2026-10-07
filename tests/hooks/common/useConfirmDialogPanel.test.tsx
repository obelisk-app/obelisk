import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useConfirmDialogPanel } from '@/hooks/common/useConfirmDialogPanel';
import { confirmDialog, getPendingConfirm, subscribeConfirm, type PendingConfirm } from '@/services/common/confirm-dialog';

const request = (over: Partial<PendingConfirm> & { id: number }): PendingConfirm => ({ title: 'x', resolve: () => {}, ...over });

describe('useConfirmDialogPanel', () => {
  it('defaults to the danger look with the trash badge, ids from the request', () => {
    const { result } = renderHook(() => useConfirmDialogPanel(request({ id: 7, title: 'Delete?' })));
    expect(result.current.danger).toBe(true);
    expect(result.current.icon).toBe('trash');
    expect(result.current.titleId).toBe('confirm-dialog-title-7');
    expect(result.current.messageId).toBe('confirm-dialog-message-7');
  });

  it('a default-tone request has no badge unless it names one', () => {
    expect(renderHook(() => useConfirmDialogPanel(request({ id: 1, tone: 'default' }))).result.current.icon).toBe('none');
    const leave = renderHook(() => useConfirmDialogPanel(request({ id: 2, tone: 'default', icon: 'leave' }))).result.current;
    expect(leave.icon).toBe('leave');
    expect(leave.danger).toBe(false);
  });

  it('cancel and confirm answer the pending request', async () => {
    const unsubscribe = subscribeConfirm(() => {});
    const answer = confirmDialog({ title: 'Delete?' });
    const pending = getPendingConfirm()!;
    renderHook(() => useConfirmDialogPanel(pending)).result.current.confirm();
    await expect(answer).resolves.toBe(true);
    const second = confirmDialog({ title: 'Again?' });
    renderHook(() => useConfirmDialogPanel(getPendingConfirm()!)).result.current.cancel();
    await expect(second).resolves.toBe(false);
    unsubscribe();
  });

  it('puts focus back on the opener when it unmounts', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = renderHook(() => useConfirmDialogPanel(request({ id: 3 })));
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
