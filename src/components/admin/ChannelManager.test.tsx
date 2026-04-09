import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ChannelManager from './ChannelManager';

const mockCategories = [
  {
    id: 'cat1', name: 'General', position: 0,
    channels: [{ id: 'ch1', name: 'chat', emoji: null, type: 'text', position: 0, categoryId: 'cat1' }],
  },
];
const mockUncategorized = [
  { id: 'ch2', name: 'welcome', emoji: '👋', type: 'text', position: 0, categoryId: null },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url: string, opts?: any) => {
    if (url === '/api/admin/categories' && (!opts || opts.method === undefined || opts.method === 'GET')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ categories: mockCategories, uncategorizedChannels: mockUncategorized }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'new', name: 'test' }) });
  }));
});

describe('ChannelManager', () => {
  it('renders categories and channels after loading', async () => {
    render(<ChannelManager isOwner={true} />);

    await waitFor(() => {
      expect(screen.getByText('General')).toBeInTheDocument();
    });
    expect(screen.getByText('chat')).toBeInTheDocument();
    expect(screen.getByText('welcome')).toBeInTheDocument();
  });

  it('shows skeleton while loading', () => {
    render(<ChannelManager isOwner={true} />);
    const skeletons = document.querySelectorAll('.lc-skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('clicking New Channel shows the creation form', async () => {
    const user = userEvent.setup();
    render(<ChannelManager isOwner={true} />);

    await waitFor(() => expect(screen.getByTestId('new-channel-btn')).toBeInTheDocument());
    await user.click(screen.getByTestId('new-channel-btn'));

    expect(screen.getByTestId('new-channel-form')).toBeInTheDocument();
    expect(screen.getByTestId('new-channel-name')).toBeInTheDocument();
  });

  it('clicking New Category shows the creation form', async () => {
    const user = userEvent.setup();
    render(<ChannelManager isOwner={true} />);

    await waitFor(() => expect(screen.getByTestId('new-category-btn')).toBeInTheDocument());
    await user.click(screen.getByTestId('new-category-btn'));

    expect(screen.getByTestId('new-category-form')).toBeInTheDocument();
    expect(screen.getByTestId('new-category-name')).toBeInTheDocument();
  });

  it('shows empty state when no channels exist', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ categories: [], uncategorizedChannels: [] }),
      })
    ));

    render(<ChannelManager isOwner={true} />);

    await waitFor(() => {
      expect(screen.getByText(/No channels yet/)).toBeInTheDocument();
    });
  });
});
