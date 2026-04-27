import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SystemContentManager from './SystemContentManager';

// Test fixtures: a server with one text channel (empezá-acá) and one
// forum channel (indice) with three tags. The text channel starts with a
// pinned welcome message; the forum channel starts empty.
const textChannel = {
  id: 'ch-empeza',
  name: 'empezá-acá',
  emoji: '📌',
  type: 'text',
  position: 0,
  categoryId: null,
  forumTags: [],
};
const forumChannel = {
  id: 'ch-indice',
  name: 'indice',
  emoji: '📜',
  type: 'forum',
  position: 1,
  categoryId: null,
  forumTags: [
    { id: 'tag-info', name: 'Info', color: '#3b82f6', position: 0 },
    { id: 'tag-reglas', name: 'Reglas', color: '#ef4444', position: 1 },
    { id: 'tag-recursos', name: 'Recursos', color: '#22c55e', position: 2 },
  ],
};

const welcomeMessage = {
  id: 'msg-welcome',
  channelId: 'ch-empeza',
  authorPubkey:
    '0000000000000000000000000000000000000000000000000000000000000000',
  title: null,
  content: '# Welcome\n\nSome body text',
  createdAt: new Date().toISOString(),
  editedAt: null,
  pinnedAt: new Date().toISOString(),
  pinnedByPubkey: 'admin-pk',
  tags: [],
};

const systemAuthor = {
  pubkey: '0000000000000000000000000000000000000000000000000000000000000000',
  displayName: 'La Crypta',
  picture: '/lacrypta-logo.png',
};

type FetchInit = { method?: string; body?: string } | undefined;

function makeFetch(overrides?: Record<string, (init: FetchInit) => any>) {
  return vi.fn((url: string, init?: FetchInit) => {
    const method = init?.method || 'GET';

    if (overrides?.[`${method} ${url}`]) {
      const out = overrides[`${method} ${url}`](init);
      return Promise.resolve({ ok: true, json: () => Promise.resolve(out) });
    }
    // Channel tree
    if (url.startsWith('/api/channels?serverId=') && method === 'GET') {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            server: { id: 'srv1', name: 'La Crypta', icon: '/lacrypta-logo.png' },
            pinnedChannels: [textChannel],
            categories: [
              {
                id: 'cat1',
                name: 'OFICIAL',
                position: 0,
                channels: [forumChannel],
              },
            ],
          }),
      });
    }
    // System messages for text channel
    if (
      url === '/api/admin/channels/ch-empeza/system-messages' &&
      method === 'GET'
    ) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            channel: { id: 'ch-empeza', type: 'text' },
            author: systemAuthor,
            messages: [welcomeMessage],
          }),
      });
    }
    // System messages for forum channel — starts empty
    if (
      url === '/api/admin/channels/ch-indice/system-messages' &&
      method === 'GET'
    ) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            channel: { id: 'ch-indice', type: 'forum' },
            author: systemAuthor,
            messages: [],
          }),
      });
    }
    // POST create
    if (
      url.startsWith('/api/admin/channels/') &&
      url.endsWith('/system-messages') &&
      method === 'POST'
    ) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 'new', ...JSON.parse(init?.body || '{}') }),
      });
    }
    // PATCH
    if (url.startsWith('/api/admin/messages/') && method === 'PATCH') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 'm1' }),
      });
    }
    // DELETE
    if (url.startsWith('/api/admin/messages/') && method === 'DELETE') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', makeFetch());
});

describe('SystemContentManager', () => {
  it('renders a skeleton before the channel tree resolves', () => {
    render(<SystemContentManager serverId="srv1" />);
    expect(screen.getByTestId('system-content-loading')).toBeInTheDocument();
  });

  it('defaults to the first text channel and shows the pin checkbox + existing row', async () => {
    render(<SystemContentManager serverId="srv1" />);

    await waitFor(() =>
      expect(screen.getByTestId('system-content-manager')).toBeInTheDocument(),
    );

    // Text channel form: pin checkbox present, no title input.
    expect(screen.getByTestId('system-content-pin')).toBeInTheDocument();
    expect(screen.queryByTestId('system-content-title')).not.toBeInTheDocument();

    // Existing welcome message row rendered with a Pinned badge.
    await waitFor(() =>
      expect(screen.getByTestId('system-content-row-msg-welcome')).toBeInTheDocument(),
    );
    expect(screen.getByText(/Pinned/i)).toBeInTheDocument();
    // Author preview shows the server name, not an admin's npub.
    expect(screen.getAllByText(/La Crypta/).length).toBeGreaterThan(0);
  });

  it('switching to a forum channel shows title input and tag buttons', async () => {
    const user = userEvent.setup();
    render(<SystemContentManager serverId="srv1" />);

    await waitFor(() =>
      expect(screen.getByTestId('system-content-manager')).toBeInTheDocument(),
    );

    await user.selectOptions(screen.getByTestId('system-channel-picker'), 'ch-indice');

    await waitFor(() =>
      expect(screen.getByTestId('system-content-title')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('system-content-pin')).not.toBeInTheDocument();
    expect(screen.getByTestId('system-tag-tag-info')).toBeInTheDocument();
    expect(screen.getByTestId('system-tag-tag-reglas')).toBeInTheDocument();
  });

  it('submitting the text form posts content + pin to the create endpoint', async () => {
    const user = userEvent.setup();
    const fetchMock = makeFetch();
    vi.stubGlobal('fetch', fetchMock);

    render(<SystemContentManager serverId="srv1" />);
    await waitFor(() =>
      expect(screen.getByTestId('system-content-manager')).toBeInTheDocument(),
    );

    await user.type(screen.getByTestId('system-content-body'), 'Hello world');
    await user.click(screen.getByTestId('system-content-pin'));
    await user.click(screen.getByTestId('system-content-submit'));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([u, init]: [string, FetchInit?]) =>
          u === '/api/admin/channels/ch-empeza/system-messages' &&
          init?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(postCall![1]!.body!);
      expect(body).toEqual({ content: 'Hello world', pin: true });
    });
  });

  it('submitting the forum form posts title, content, and tagIds', async () => {
    const user = userEvent.setup();
    const fetchMock = makeFetch();
    vi.stubGlobal('fetch', fetchMock);

    render(<SystemContentManager serverId="srv1" />);
    await waitFor(() =>
      expect(screen.getByTestId('system-content-manager')).toBeInTheDocument(),
    );

    await user.selectOptions(screen.getByTestId('system-channel-picker'), 'ch-indice');
    await waitFor(() =>
      expect(screen.getByTestId('system-content-title')).toBeInTheDocument(),
    );

    await user.type(screen.getByTestId('system-content-title'), 'Redes');
    await user.type(screen.getByTestId('system-content-body'), 'Some links');
    await user.click(screen.getByTestId('system-tag-tag-recursos'));
    await user.click(screen.getByTestId('system-content-submit'));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([u, init]: [string, FetchInit?]) =>
          u === '/api/admin/channels/ch-indice/system-messages' &&
          init?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(postCall![1]!.body!);
      expect(body).toEqual({
        title: 'Redes',
        content: 'Some links',
        tagIds: ['tag-recursos'],
      });
    });
  });

  it('clicking Edit prefills the form and PATCHes on save', async () => {
    const user = userEvent.setup();
    const fetchMock = makeFetch();
    vi.stubGlobal('fetch', fetchMock);

    render(<SystemContentManager serverId="srv1" />);
    await waitFor(() =>
      expect(screen.getByTestId('system-content-row-msg-welcome')).toBeInTheDocument(),
    );

    await user.click(screen.getByTestId('system-content-edit-msg-welcome'));

    const textarea = screen.getByTestId('system-content-body') as HTMLTextAreaElement;
    expect(textarea.value).toContain('Welcome');

    await user.clear(textarea);
    await user.type(textarea, 'Updated body');
    await user.click(screen.getByTestId('system-content-submit'));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([u, init]: [string, FetchInit?]) =>
          u === '/api/admin/messages/msg-welcome' && init?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall![1]!.body!);
      expect(body.content).toBe('Updated body');
    });
  });

  it('Delete button opens the confirm dialog and DELETEs on confirm', async () => {
    const user = userEvent.setup();
    const fetchMock = makeFetch();
    vi.stubGlobal('fetch', fetchMock);

    render(<SystemContentManager serverId="srv1" />);
    await waitFor(() =>
      expect(screen.getByTestId('system-content-row-msg-welcome')).toBeInTheDocument(),
    );

    await user.click(screen.getByTestId('system-content-delete-msg-welcome'));

    const dialog = await screen.findByTestId('confirm-dialog');
    await user.click(within(dialog).getByTestId('confirm-btn'));

    await waitFor(() => {
      const delCall = fetchMock.mock.calls.find(
        ([u, init]: [string, FetchInit?]) =>
          u === '/api/admin/messages/msg-welcome' && init?.method === 'DELETE',
      );
      expect(delCall).toBeTruthy();
    });
  });

  it('shows an inline error message when the server rejects the request', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: string, init?: FetchInit) => {
      const method = init?.method || 'GET';
      if (url.startsWith('/api/channels?serverId=')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              pinnedChannels: [textChannel],
              categories: [],
            }),
        });
      }
      if (
        url === '/api/admin/channels/ch-empeza/system-messages' &&
        method === 'GET'
      ) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              channel: { id: 'ch-empeza', type: 'text' },
              author: systemAuthor,
              messages: [],
            }),
        });
      }
      if (
        url === '/api/admin/channels/ch-empeza/system-messages' &&
        method === 'POST'
      ) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: 'Content too long' }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<SystemContentManager serverId="srv1" />);
    await waitFor(() =>
      expect(screen.getByTestId('system-content-manager')).toBeInTheDocument(),
    );

    await user.type(screen.getByTestId('system-content-body'), 'boom');
    await user.click(screen.getByTestId('system-content-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('system-content-error')).toHaveTextContent(/Content too long/),
    );
  });
});
