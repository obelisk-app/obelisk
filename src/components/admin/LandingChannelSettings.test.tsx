import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LandingChannelSettings from './LandingChannelSettings';

const mockCategories = [
  {
    id: 'cat1',
    name: 'General',
    position: 0,
    channels: [
      { id: 'ch1', name: 'chat', emoji: null, type: 'text', position: 0, categoryId: 'cat1' },
      { id: 'voice1', name: 'voice-room', emoji: null, type: 'voice', position: 0, categoryId: 'cat1' },
    ],
  },
];
const mockUncategorized = [
  { id: 'ch2', name: 'empeza-aca', emoji: '👋', type: 'text', position: 0, categoryId: null },
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.startsWith('/api/admin/categories')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              categories: mockCategories,
              uncategorizedChannels: mockUncategorized,
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }),
  );
});

describe('LandingChannelSettings', () => {
  it('renders disabled by default and lists only text channels', async () => {
    render(<LandingChannelSettings serverId="srv1" currentChannelId={null} />);
    expect(screen.getByTestId('landing-channel-status')).toHaveTextContent(/disabled/i);

    const select = screen.getByTestId('landing-channel-select') as HTMLSelectElement;
    await waitFor(() => {
      const ids = Array.from(select.options).map((o) => o.value);
      expect(ids).toContain('ch1');
      expect(ids).toContain('ch2');
      expect(ids).not.toContain('voice1');
    });
  });

  it('shows enabled status when a channel is preselected', () => {
    render(<LandingChannelSettings serverId="srv1" currentChannelId="ch2" />);
    expect(screen.getByTestId('landing-channel-status')).toHaveTextContent(/enabled/i);
  });

  it('uses form field name "landingChannelId" so the admin form captures it', async () => {
    render(<LandingChannelSettings serverId="srv1" currentChannelId={null} />);
    const select = screen.getByTestId('landing-channel-select') as HTMLSelectElement;
    expect(select.name).toBe('landingChannelId');
    await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
    await userEvent.selectOptions(select, 'ch1');
    expect(select.value).toBe('ch1');
  });

  it('does not render welcome-bot specific UI (distinct from WelcomeBotSettings)', () => {
    render(<LandingChannelSettings serverId="srv1" currentChannelId={null} />);
    expect(screen.queryByTestId('welcome-bot-settings')).toBeNull();
    expect(screen.queryByTestId('welcome-locale-select')).toBeNull();
  });
});
