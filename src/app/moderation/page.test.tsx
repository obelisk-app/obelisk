import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    isConnected: true,
    profile: { pubkey: 'mod-pk', name: 'Mod' },
  }),
}));

import ModerationPage from './page';

function mockFetch(role: string, options?: {
  reports?: any[];
  mutes?: any[];
  warnings?: any[];
  log?: any[];
  hasMoreLog?: boolean;
}) {
  const { reports = [], mutes = [], warnings = [], log = [], hasMoreLog = false } = options || {};
  return vi.fn((url: string) => {
    if (url === '/api/auth/me/role') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ role, pubkey: 'mod-pk' }) });
    }
    if (url === '/api/moderation/reports') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(reports) });
    }
    if (url === '/api/moderation/mutes') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mutes) });
    }
    if (url === '/api/moderation/warnings') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(warnings) });
    }
    if (url.startsWith('/api/moderation/log')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ actions: log, hasMore: hasMoreLog }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

describe('ModerationPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows access denied for member role', async () => {
    vi.stubGlobal('fetch', mockFetch('member'));
    render(<ModerationPage />);

    await waitFor(() => {
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });
    expect(screen.getByText(/moderator, admin, or owner permissions/)).toBeInTheDocument();
  });

  it('renders reports tab with report cards', async () => {
    const reports = [{
      id: 'r1', messageId: 'm1', reporterPubkey: 'reporter-pk', reason: 'Spam',
      status: 'pending', createdAt: new Date().toISOString(),
      message: { id: 'm1', content: 'Bad message', authorPubkey: 'author-pk', channelId: 'ch1' },
    }];
    vi.stubGlobal('fetch', mockFetch('mod', { reports }));
    render(<ModerationPage />);

    await waitFor(() => {
      expect(screen.getByText('Bad message')).toBeInTheDocument();
    });
    expect(screen.getByText(/Spam/)).toBeInTheDocument();
  });

  it('renders mute form in mutes tab', async () => {
    vi.stubGlobal('fetch', mockFetch('mod'));
    const user = userEvent.setup();
    render(<ModerationPage />);

    await waitFor(() => expect(screen.getByText('mutes')).toBeInTheDocument());
    await user.click(screen.getByText('mutes'));

    expect(screen.getByTestId('mute-form')).toBeInTheDocument();
    expect(screen.getByTestId('mute-pubkey')).toBeInTheDocument();
    expect(screen.getByTestId('mute-submit')).toBeInTheDocument();
  });

  it('renders warn form in warnings tab', async () => {
    vi.stubGlobal('fetch', mockFetch('mod'));
    const user = userEvent.setup();
    render(<ModerationPage />);

    await waitFor(() => expect(screen.getByText('warnings')).toBeInTheDocument());
    await user.click(screen.getByText('warnings'));

    expect(screen.getByTestId('warn-form')).toBeInTheDocument();
    expect(screen.getByTestId('warn-pubkey')).toBeInTheDocument();
    expect(screen.getByTestId('warn-submit')).toBeInTheDocument();
  });

  it('shows Load more in log tab when hasMore is true', async () => {
    const log = [{ id: 'a1', actorPubkey: 'act-pk', targetPubkey: 'tgt-pk', action: 'ban', reason: 'spam', metadata: null, createdAt: new Date().toISOString() }];
    vi.stubGlobal('fetch', mockFetch('mod', { log, hasMoreLog: true }));
    const user = userEvent.setup();
    render(<ModerationPage />);

    await waitFor(() => expect(screen.getByText('log')).toBeInTheDocument());
    await user.click(screen.getByText('log'));

    await waitFor(() => {
      expect(screen.getByTestId('load-more-log')).toBeInTheDocument();
    });
  });

  it('hides Load more when hasMore is false', async () => {
    const log = [{ id: 'a1', actorPubkey: 'act-pk', targetPubkey: 'tgt-pk', action: 'ban', reason: null, metadata: null, createdAt: new Date().toISOString() }];
    vi.stubGlobal('fetch', mockFetch('mod', { log, hasMoreLog: false }));
    const user = userEvent.setup();
    render(<ModerationPage />);

    await waitFor(() => expect(screen.getByText('log')).toBeInTheDocument());
    await user.click(screen.getByText('log'));

    await waitFor(() => {
      expect(screen.getByTestId('mod-action')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('load-more-log')).not.toBeInTheDocument();
  });
});
