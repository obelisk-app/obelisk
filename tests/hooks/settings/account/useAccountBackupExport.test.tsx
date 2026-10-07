import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

const downloadAccountBackup = vi.hoisted(() => vi.fn());
vi.mock('@/services/settings/account-backup', () => ({ downloadAccountBackup }));

import { useAccountBackupExport } from '@/hooks/settings/account/useAccountBackupExport';

beforeEach(() => {
  downloadAccountBackup.mockReset();
});

describe('useAccountBackupExport', () => {
  it('is working while the backup builds, then done', async () => {
    let finish!: (value: unknown) => void;
    downloadAccountBackup.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useAccountBackupExport(), { wrapper: LocaleProvider });
    expect(result.current.status).toBe('idle');
    act(() => result.current.download());
    expect(result.current.working).toBe(true);
    await act(async () => { finish({ media: [] }); });
    expect(result.current.status).toBe('done');
    expect(result.current.message).toBe('Backup downloaded.');
  });

  it('reports a failure', async () => {
    downloadAccountBackup.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAccountBackupExport(), { wrapper: LocaleProvider });
    await act(async () => result.current.download());
    expect(result.current.status).toBe('error');
    expect(result.current.message).toBe('Backup failed.');
  });
});
