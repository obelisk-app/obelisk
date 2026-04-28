import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InviteAliasManager from './InviteAliasManager';

const aliasRow = (overrides: Partial<any> = {}) => ({
  id: 'a1',
  slug: 'obelisk',
  serverId: 'srv1',
  enabled: true,
  createdBy: 'adminpk',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

function mockFetch(responses: Array<{ ok: boolean; status?: number; json: any }>) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 400),
      json: () => Promise.resolve(r.json),
    });
  }
  (global as any).fetch = fn;
  return fn;
}

describe('InviteAliasManager', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders existing aliases', async () => {
    mockFetch([{ ok: true, json: { aliases: [aliasRow()] } }]);
    render(<InviteAliasManager serverId="srv1" />);
    await screen.findAllByText(
      (_c, el) => el?.tagName === 'CODE' && el?.textContent?.trim() === '/invite/obelisk'
    );
  });

  it('creates a new alias', async () => {
    mockFetch([
      { ok: true, json: { aliases: [] } },
      { ok: true, status: 201, json: { alias: aliasRow({ id: 'new1', slug: 'hello' }) } },
    ]);
    render(<InviteAliasManager serverId="srv1" />);
    await screen.findByTestId('alias-slug-input');
    fireEvent.change(screen.getByTestId('alias-slug-input'), {
      target: { value: 'hello' },
    });
    fireEvent.click(screen.getByTestId('alias-create-btn'));
    await screen.findAllByText(
      (_c, el) => el?.tagName === 'CODE' && el?.textContent?.trim() === '/invite/hello'
    );
  });

  it('shows error when create fails', async () => {
    mockFetch([
      { ok: true, json: { aliases: [] } },
      { ok: false, status: 409, json: { error: 'That slug is already in use' } },
    ]);
    render(<InviteAliasManager serverId="srv1" />);
    await screen.findByTestId('alias-slug-input');
    fireEvent.change(screen.getByTestId('alias-slug-input'), {
      target: { value: 'taken' },
    });
    fireEvent.click(screen.getByTestId('alias-create-btn'));
    await screen.findByTestId('alias-error');
  });

  it('toggles enabled', async () => {
    mockFetch([
      { ok: true, json: { aliases: [aliasRow()] } },
      { ok: true, json: { alias: aliasRow({ enabled: false }) } },
    ]);
    render(<InviteAliasManager serverId="srv1" />);
    await screen.findAllByText(
      (_c, el) => el?.tagName === 'CODE' && el?.textContent?.trim() === '/invite/obelisk'
    );
    fireEvent.click(screen.getByTestId('alias-toggle-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('alias-toggle-btn').textContent).toBe('Enable');
    });
  });

  it('deletes alias after confirm', async () => {
    mockFetch([
      { ok: true, json: { aliases: [aliasRow()] } },
      { ok: true, json: { ok: true } },
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<InviteAliasManager serverId="srv1" />);
    await screen.findAllByText(
      (_c, el) => el?.tagName === 'CODE' && el?.textContent?.trim() === '/invite/obelisk'
    );
    fireEvent.click(screen.getByTestId('alias-delete-btn'));
    await waitFor(() =>
      expect(screen.queryByTestId('alias-row')).not.toBeInTheDocument()
    );
  });

  it('renames alias', async () => {
    mockFetch([
      { ok: true, json: { aliases: [aliasRow()] } },
      { ok: true, json: { alias: aliasRow({ slug: 'renamed' }) } },
    ]);
    render(<InviteAliasManager serverId="srv1" />);
    await screen.findAllByText(
      (_c, el) => el?.tagName === 'CODE' && el?.textContent?.trim() === '/invite/obelisk'
    );
    fireEvent.click(screen.getByTestId('alias-rename-btn'));
    fireEvent.change(screen.getByTestId('alias-rename-input'), {
      target: { value: 'renamed' },
    });
    fireEvent.click(screen.getByText('Save'));
    await screen.findAllByText(
      (_c, el) => el?.tagName === 'CODE' && el?.textContent?.trim() === '/invite/renamed'
    );
  });
});
