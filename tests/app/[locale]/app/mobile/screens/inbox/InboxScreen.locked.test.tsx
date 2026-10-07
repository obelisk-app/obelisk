import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InboxScreen } from '@/app/[locale]/app/mobile/screens/inbox/InboxScreen';
import { useNotificationsStore } from '@/store/notifications';
import { useReadStateStore } from '@/store/read-state';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';

const SENDER = 'b'.repeat(64);

beforeEach(() => {
  useReadStateStore.setState({ inboxLastReadAt: 1_000 });
  useNotificationsStore.setState({ dmNotifications: [{ id: 'card', senderPubkey: SENDER, createdAt: 5_000 }] });
});

describe('the phone inbox while DMs are locked', () => {
  it('shows the card without text, and one row that opens the DM list', () => {
    const go = vi.fn();
    renderWithBridge(
      <InboxScreen go={go} selectGroup={vi.fn()} selectPeer={vi.fn()} />,
      fakeBridge({ dmLock: { status: 'locked', unopened: [6_000] } }),
      { locale: 'pt' },
    );
    fireEvent.click(screen.getByTestId('inbox-tab-dms'));
    expect(screen.getByText('Nova mensagem direta')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('inbox-dm-locked'));
    expect(go).toHaveBeenCalledWith('dms-list');
    expect(screen.getByTestId('inbox-dm-locked')).toHaveTextContent('1 nova mensagem direta');
  });
});
