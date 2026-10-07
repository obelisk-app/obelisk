import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

const downloadAccountBackup = vi.hoisted(() => vi.fn());
vi.mock('@/services/settings/account-backup', () => ({ downloadAccountBackup }));

import AccountBackupExport from '@/components/settings/account/AccountBackupExport';

const renderEn = (mobile = false) => render(<LocaleProvider initialLocale="en"><AccountBackupExport mobile={mobile} /></LocaleProvider>);

beforeEach(() => {
  downloadAccountBackup.mockReset();
});

describe('AccountBackupExport', () => {
  it('downloads, shows the working label meanwhile and announces success', async () => {
    let finish!: (value: unknown) => void;
    downloadAccountBackup.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderEn();
    const button = screen.getByTestId('desktop-download-backup');
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Preparing backup…');
    finish({ media: [{ url: 'a' }] });
    expect(await screen.findByRole('status')).toHaveTextContent('Backup downloaded.');
    expect(button).not.toBeDisabled();
    expect(button).toHaveTextContent('Download account backup');
  });

  it('counts the media that could not be embedded', async () => {
    downloadAccountBackup.mockResolvedValue({ media: [{ url: 'a', error: 'x' }, { url: 'b' }, { url: 'c', error: 'y' }] });
    renderEn(true);
    fireEvent.click(screen.getByTestId('mobile-download-backup'));
    expect(await screen.findByRole('status')).toHaveTextContent('Backup downloaded. 2 media file(s) could not be embedded');
  });

  it('says it failed, as an alert', async () => {
    downloadAccountBackup.mockRejectedValue(new Error('boom'));
    renderEn();
    fireEvent.click(screen.getByTestId('desktop-download-backup'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Backup failed.'));
  });
});
