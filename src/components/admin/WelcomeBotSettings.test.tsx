import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WelcomeBotSettings from './WelcomeBotSettings';

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
  { id: 'ch2', name: 'bienvenida', emoji: '👋', type: 'text', position: 0, categoryId: null },
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

describe('WelcomeBotSettings', () => {
  it('renders text channels only (filters voice) and the current selection', async () => {
    render(
      <WelcomeBotSettings
        serverId="srv1"
        serverName="La Crypta"
        currentChannelId="ch2"
        currentLocale="es"
      />,
    );

    const select = (await screen.findByTestId('welcome-channel-select')) as HTMLSelectElement;
    // Wait for channel fetch to populate options.
    await waitFor(() => {
      expect(select.querySelectorAll('option').length).toBeGreaterThan(1);
    });

    const optionValues = Array.from(select.querySelectorAll('option')).map((o) => o.value);
    expect(optionValues).toContain(''); // disabled option
    expect(optionValues).toContain('ch1');
    expect(optionValues).toContain('ch2');
    expect(optionValues).not.toContain('voice1'); // voice channel filtered out

    // Current selection respected.
    expect(select.value).toBe('ch2');
  });

  it('shows the Spanish preview by default and switches to English when locale changes', async () => {
    render(
      <WelcomeBotSettings
        serverId="srv1"
        serverName="La Crypta"
        currentChannelId="ch2"
        currentLocale="es"
      />,
    );

    // Wait for channels to load and preview to render.
    const preview = await screen.findByTestId('welcome-preview');
    expect(preview.textContent).toContain('bienvenid@');
    expect(preview.textContent).toContain('La Crypta');

    const localeSelect = screen.getByTestId('welcome-locale-select') as HTMLSelectElement;
    await userEvent.selectOptions(localeSelect, 'en');

    await waitFor(() => {
      expect(screen.getByTestId('welcome-preview').textContent).toContain('welcome to');
    });
    expect(screen.getByTestId('welcome-preview').textContent).not.toContain('bienvenid@');
  });

  it('shows the disabled-preview placeholder when no channel is selected', async () => {
    render(
      <WelcomeBotSettings
        serverId="srv1"
        serverName="La Crypta"
        currentChannelId={null}
        currentLocale={null}
      />,
    );

    await screen.findByTestId('welcome-preview-disabled');
    expect(screen.queryByTestId('welcome-preview')).not.toBeInTheDocument();

    // Selecting a channel should flip the preview on.
    const channelSelect = (await screen.findByTestId(
      'welcome-channel-select',
    )) as HTMLSelectElement;
    await waitFor(() => {
      expect(channelSelect.querySelectorAll('option').length).toBeGreaterThan(1);
    });
    await userEvent.selectOptions(channelSelect, 'ch1');

    await waitFor(() => {
      expect(screen.getByTestId('welcome-preview')).toBeInTheDocument();
    });
  });

  it('uses the provided preview member display name when available', async () => {
    render(
      <WelcomeBotSettings
        serverId="srv1"
        serverName="La Crypta"
        currentChannelId="ch2"
        currentLocale="es"
        previewMember={{ displayName: 'satoshi', picture: null }}
      />,
    );

    const preview = await screen.findByTestId('welcome-preview');
    expect(preview.textContent).toContain('satoshi');
  });
});
