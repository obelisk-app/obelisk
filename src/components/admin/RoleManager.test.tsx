import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RoleManager from './RoleManager';

const mockRoles = [
  { id: 'r1', name: 'VIP', color: '#ff0000', icon: '⭐', priority: 10, _count: { members: 3 }, createdAt: '2026-01-01' },
  { id: 'r2', name: 'Artist', color: '#00ff00', icon: null, priority: 5, _count: { members: 1 }, createdAt: '2026-01-02' },
];

describe('RoleManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading skeletons then role list', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockRoles),
    });

    render(<RoleManager serverId="srv1" />);

    // Should show skeleton during load
    await waitFor(() => {
      expect(screen.getByTestId('role-list')).toBeInTheDocument();
    });

    expect(screen.getByText('VIP')).toBeInTheDocument();
    expect(screen.getByText('Artist')).toBeInTheDocument();
    expect(screen.getByText('3 members')).toBeInTheDocument();
    expect(screen.getByText('1 member')).toBeInTheDocument();
  });

  it('shows empty state when no roles exist', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    render(<RoleManager serverId="srv1" />);

    await waitFor(() => {
      expect(screen.getByText(/no custom roles/i)).toBeInTheDocument();
    });
  });

  it('creates a new role', async () => {
    global.fetch = vi.fn()
      // Initial fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      // POST create
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 'r3', name: 'Founder', color: '#0000ff', icon: null, priority: 0, _count: { members: 0 } }),
      })
      // Refetch after create
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ id: 'r3', name: 'Founder', color: '#0000ff', icon: null, priority: 0, _count: { members: 0 } }]),
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

    // Verify POST was called with correct body
    const postCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: [string, RequestInit?]) => c[1]?.method === 'POST',
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1]!.body as string);
    expect(body.name).toBe('Founder');
  });

  it('shows error when name is empty', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    render(<RoleManager serverId="srv1" />);

    await waitFor(() => {
      expect(screen.getByTestId('create-role-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('create-role-btn'));

    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });

  it('enters edit mode and saves', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockRoles) })
      // PATCH
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ...mockRoles[0], name: 'Gold' }) })
      // Refetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ ...mockRoles[0], name: 'Gold' }, mockRoles[1]]) });

    render(<RoleManager serverId="srv1" />);

    await waitFor(() => {
      expect(screen.getAllByTestId('edit-role-btn')).toHaveLength(2);
    });

    // Click edit on first role
    fireEvent.click(screen.getAllByTestId('edit-role-btn')[0]);
    expect(screen.getByTestId('edit-role-name')).toBeInTheDocument();

    // Change name and save
    fireEvent.change(screen.getByTestId('edit-role-name'), { target: { value: 'Gold' } });
    fireEvent.click(screen.getByTestId('save-role-btn'));

    await waitFor(() => {
      expect(screen.getByText('Gold')).toBeInTheDocument();
    });
  });

  it('deletes a role', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockRoles) })
      // DELETE
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) });

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
