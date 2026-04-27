import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RoleManager from './RoleManager';

const mockRoles = [
  { id: 'r1', name: 'VIP', color: '#ff0000', icon: '⭐', priority: 10, _count: { members: 3 }, createdAt: '2026-01-01' },
  { id: 'r2', name: 'Artist', color: '#00ff00', icon: null, priority: 5, _count: { members: 1 }, createdAt: '2026-01-02' },
];

type Route = (url: string, opts?: RequestInit) => Promise<unknown> | unknown;

function mockFetch(route: Route) {
  global.fetch = vi.fn((url: string, opts?: RequestInit) => {
    if (url.startsWith('/api/admin/emojis')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ emojis: [] }) });
    }
    const result = route(url, opts);
    return Promise.resolve(result);
  }) as unknown as typeof fetch;
}

describe('RoleManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading skeletons then role list', async () => {
    mockFetch((url) => {
      if (url.startsWith('/api/admin/roles')) {
        return { ok: true, json: () => Promise.resolve(mockRoles) };
      }
      return { ok: true, json: () => Promise.resolve({}) };
    });

    render(<RoleManager serverId="srv1" />);

    await waitFor(() => {
      expect(screen.getByTestId('role-list')).toBeInTheDocument();
    });

    const list = screen.getByTestId('role-list');
    expect(list).toHaveTextContent('VIP');
    expect(list).toHaveTextContent('Artist');
    expect(screen.getByText('3 members')).toBeInTheDocument();
    expect(screen.getByText('1 member')).toBeInTheDocument();
  });

  it('shows empty state when no roles exist', async () => {
    mockFetch((url) => {
      if (url.startsWith('/api/admin/roles')) {
        return { ok: true, json: () => Promise.resolve([]) };
      }
      return { ok: true, json: () => Promise.resolve({}) };
    });

    render(<RoleManager serverId="srv1" />);

    await waitFor(() => {
      expect(screen.getByText(/no custom roles/i)).toBeInTheDocument();
    });
  });

  it('creates a new role', async () => {
    let roles: typeof mockRoles = [];
    const newRole = { id: 'r3', name: 'Founder', color: '#0000ff', icon: null, priority: 0, _count: { members: 0 }, createdAt: '2026-01-03' };
    mockFetch((url, opts) => {
      if (url.startsWith('/api/admin/roles') && opts?.method === 'POST') {
        roles = [newRole as typeof mockRoles[number]];
        return { ok: true, status: 201, json: () => Promise.resolve(newRole) };
      }
      if (url.startsWith('/api/admin/roles')) {
        return { ok: true, json: () => Promise.resolve(roles) };
      }
      return { ok: true, json: () => Promise.resolve({}) };
    });

    render(<RoleManager serverId="srv1" />);

    await waitFor(() => {
      expect(screen.getByTestId('create-role-btn')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('role-name-input'), { target: { value: 'Founder' } });
    fireEvent.click(screen.getByTestId('create-role-btn'));

    await waitFor(() => {
      expect(screen.getByText('Founder')).toBeInTheDocument();
    });

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit?]>;
    const postCall = calls.find((c) => c[1]?.method === 'POST');
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1]!.body as string);
    expect(body.name).toBe('Founder');
  });

  it('shows error when name is empty', async () => {
    mockFetch((url) => {
      if (url.startsWith('/api/admin/roles')) {
        return { ok: true, json: () => Promise.resolve([]) };
      }
      return { ok: true, json: () => Promise.resolve({}) };
    });

    render(<RoleManager serverId="srv1" />);

    await waitFor(() => {
      expect(screen.getByTestId('create-role-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('create-role-btn'));

    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });

  it('enters edit mode and saves', async () => {
    let roles: typeof mockRoles = mockRoles;
    mockFetch((url, opts) => {
      if (url.match(/\/api\/admin\/roles\/r\d+/) && opts?.method === 'PATCH') {
        roles = [{ ...mockRoles[0], name: 'Gold' }, mockRoles[1]];
        return { ok: true, json: () => Promise.resolve({ ...mockRoles[0], name: 'Gold' }) };
      }
      if (url.startsWith('/api/admin/roles')) {
        return { ok: true, json: () => Promise.resolve(roles) };
      }
      return { ok: true, json: () => Promise.resolve({}) };
    });

    render(<RoleManager serverId="srv1" />);

    await waitFor(() => {
      expect(screen.getAllByTestId('edit-role-btn')).toHaveLength(2);
    });

    fireEvent.click(screen.getAllByTestId('edit-role-btn')[0]);
    expect(screen.getByTestId('edit-role-name')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('edit-role-name'), { target: { value: 'Gold' } });
    fireEvent.click(screen.getByTestId('save-role-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('role-list')).toHaveTextContent('Gold');
    });
  });

  it('deletes a role', async () => {
    let roles: typeof mockRoles = mockRoles;
    mockFetch((url, opts) => {
      if (url.match(/\/api\/admin\/roles\/r\d+/) && opts?.method === 'DELETE') {
        roles = roles.filter((r) => !url.endsWith(r.id) ? true : false);
        // Actually remove the matched id:
        const id = url.split('/').pop();
        roles = mockRoles.filter((r) => r.id !== id);
        return { ok: true, json: () => Promise.resolve({ ok: true }) };
      }
      if (url.startsWith('/api/admin/roles')) {
        return { ok: true, json: () => Promise.resolve(roles) };
      }
      return { ok: true, json: () => Promise.resolve({}) };
    });

    render(<RoleManager serverId="srv1" />);

    await waitFor(() => {
      expect(screen.getAllByTestId('delete-role-btn')).toHaveLength(2);
    });

    fireEvent.click(screen.getAllByTestId('delete-role-btn')[1]);

    await waitFor(() => {
      expect(screen.queryByText('Artist')).not.toBeInTheDocument();
    });
  });
});
