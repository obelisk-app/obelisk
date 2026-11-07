import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { ManageMemberRow } from '@/app/[locale]/app/modals/channel-settings/ManageMemberRow';
import { ManageMemberRowMobile } from '@/app/[locale]/app/mobile/sheets/channel/ManageMemberRowMobile';

const pubkey = 'a'.repeat(64);

describe.each([['desktop', ManageMemberRow], ['phone', ManageMemberRowMobile]] as const)('%s member promotion', (_shell, Row) => {
  it('offers promotion for an existing member and publishes only after confirmation', async () => {
    const putUser = vi.fn().mockResolvedValue(undefined);
    renderWithBridge(<Row groupId="private" pubkey={pubkey} isAdmin={false} />, fakeBridge({}, { putUser }));
    fireEvent.click(screen.getByRole('button', { name: 'Promote to admin' }));
    expect(putUser).not.toHaveBeenCalled();
    expect(screen.getByText(/Promote .* to admin\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Promote to admin' }));
    await waitFor(() => expect(putUser).toHaveBeenCalledExactlyOnceWith('private', pubkey, ['admin'], undefined));
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('does not offer promotion for an administrator', () => {
    renderWithBridge(<Row groupId="private" pubkey={pubkey} isAdmin />, fakeBridge());
    expect(screen.queryByRole('button', { name: 'Promote to admin' })).not.toBeInTheDocument();
  });
});
