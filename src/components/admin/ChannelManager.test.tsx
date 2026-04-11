import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ChannelManager from './ChannelManager';

const mockCategories = [
  {
    id: 'cat1', name: 'General', position: 0,
    channels: [{ id: 'ch1', name: 'chat', emoji: null, type: 'text', position: 0, categoryId: 'cat1', writePermission: null }],
  },
];
const mockUncategorized = [
  { id: 'ch2', name: 'welcome', emoji: '👋', type: 'text', position: 0, categoryId: null, writePermission: 'mod' },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url: string, opts?: any) => {
    if (url.startsWith('/api/admin/categories') && (!opts || opts.method === undefined || opts.method === 'GET')) {
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
    render(<ChannelManager serverId="srv1" isOwner={true} />);

    await waitFor(() => {
      expect(screen.getByText('General')).toBeInTheDocument();
    });
    expect(screen.getByText('chat')).toBeInTheDocument();
    expect(screen.getByText('welcome')).toBeInTheDocument();
  });

  it('shows skeleton while loading', () => {
    render(<ChannelManager serverId="srv1" isOwner={true} />);
    const skeletons = document.querySelectorAll('.lc-skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('clicking New Channel shows the creation form', async () => {
    const user = userEvent.setup();
    render(<ChannelManager serverId="srv1" isOwner={true} />);

    await waitFor(() => expect(screen.getByTestId('new-channel-btn')).toBeInTheDocument());
    await user.click(screen.getByTestId('new-channel-btn'));

    expect(screen.getByTestId('new-channel-form')).toBeInTheDocument();
    expect(screen.getByTestId('new-channel-name')).toBeInTheDocument();
  });

  it('clicking New Category shows the creation form', async () => {
    const user = userEvent.setup();
    render(<ChannelManager serverId="srv1" isOwner={true} />);

    await waitFor(() => expect(screen.getByTestId('new-category-btn')).toBeInTheDocument());
    await user.click(screen.getByTestId('new-category-btn'));

    expect(screen.getByTestId('new-category-form')).toBeInTheDocument();
    expect(screen.getByTestId('new-category-name')).toBeInTheDocument();
  });

  it('edit form shows write-permission dropdown with channel value and PATCHes on save', async () => {
    const patchCalls: any[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string, opts?: any) => {
      if (url.startsWith('/api/admin/categories') && (!opts || opts.method === undefined || opts.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ categories: mockCategories, uncategorizedChannels: mockUncategorized }),
        });
      }
      if (url.startsWith('/api/admin/channels/') && opts?.method === 'PATCH') {
        patchCalls.push({ url, body: JSON.parse(opts.body) });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }));

    const user = userEvent.setup();
    render(<ChannelManager serverId="srv1" isOwner={true} />);

    await waitFor(() => expect(screen.getByText('welcome')).toBeInTheDocument());

    // Start editing the uncategorized "welcome" channel (writePermission = 'mod').
    // It's rendered before the category rows, so its Edit button is the first one.
    const editBtns = screen.getAllByText('Edit');
    await user.click(editBtns[0]);

    const select = screen.getByTestId('edit-channel-write-permission') as HTMLSelectElement;
    expect(select.value).toBe('mod');

    await user.selectOptions(select, 'admin');
    expect(select.value).toBe('admin');

    await user.click(screen.getByText('Save'));

    await waitFor(() => expect(patchCalls.length).toBeGreaterThan(0));
    expect(patchCalls[0].url).toContain('/api/admin/channels/ch2');
    expect(patchCalls[0].body.writePermission).toBe('admin');
  });

  it('shows empty state when no channels exist', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ categories: [], uncategorizedChannels: [] }),
      })
    ));

    render(<ChannelManager serverId="srv1" isOwner={true} />);

    await waitFor(() => {
      expect(screen.getByText(/No channels yet/)).toBeInTheDocument();
    });
  });
});
