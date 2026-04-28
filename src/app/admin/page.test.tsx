import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

import AdminIndexPage from './page';

describe('AdminIndexPage (redirect)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to the first available server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              servers: [
                { id: 'srv1', name: 'A', icon: null, role: 'owner', viaInstanceOwner: false },
                { id: 'srv2', name: 'B', icon: null, role: 'admin', viaInstanceOwner: false },
              ],
              instanceOwner: false,
            }),
        })
      )
    );

    render(<AdminIndexPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/admin/srv1');
    });
  });

  it('shows access denied when caller has no admin servers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ servers: [], instanceOwner: false }),
        })
      )
    );

    render(<AdminIndexPage />);

    await waitFor(() => {
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects unauthenticated users to /', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Unauthorized' }),
        })
      )
    );

    render(<AdminIndexPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });
});
