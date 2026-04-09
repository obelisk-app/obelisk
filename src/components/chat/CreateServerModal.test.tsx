import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CreateServerModal from './CreateServerModal';

describe('CreateServerModal', () => {
  const mockOnClose = vi.fn();
  const mockOnCreate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders create form by default', () => {
    render(<CreateServerModal onClose={mockOnClose} onCreate={mockOnCreate} />);
    expect(screen.getByText('Create a Server')).toBeInTheDocument();
    expect(screen.getByTestId('server-name-input')).toBeInTheDocument();
  });

  it('switches to join mode', async () => {
    const user = userEvent.setup();
    render(<CreateServerModal onClose={mockOnClose} onCreate={mockOnCreate} />);
    await user.click(screen.getByText('Join'));
    expect(screen.getByText('Join a Server')).toBeInTheDocument();
    expect(screen.getByTestId('server-join-input')).toBeInTheDocument();
  });

  it('calls onClose when cancel clicked', async () => {
    const user = userEvent.setup();
    render(<CreateServerModal onClose={mockOnClose} onCreate={mockOnCreate} />);
    await user.click(screen.getByText('Cancel'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('disables submit when name is empty', () => {
    render(<CreateServerModal onClose={mockOnClose} onCreate={mockOnCreate} />);
    expect(screen.getByTestId('server-submit-btn')).toBeDisabled();
  });

  it('creates server on submit', async () => {
    const user = userEvent.setup();
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 's1', name: 'Test', icon: null, banner: null }),
    });

    render(<CreateServerModal onClose={mockOnClose} onCreate={mockOnCreate} />);
    await user.type(screen.getByTestId('server-name-input'), 'Test');
    await user.click(screen.getByTestId('server-submit-btn'));

    expect(global.fetch).toHaveBeenCalledWith('/api/servers', expect.objectContaining({ method: 'POST' }));
    expect(mockOnCreate).toHaveBeenCalledWith({ id: 's1', name: 'Test', icon: null, banner: null });
  });

  it('shows error on failed create', async () => {
    const user = userEvent.setup();
    (global.fetch as any).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Name taken' }),
    });

    render(<CreateServerModal onClose={mockOnClose} onCreate={mockOnCreate} />);
    await user.type(screen.getByTestId('server-name-input'), 'Test');
    await user.click(screen.getByTestId('server-submit-btn'));

    expect(screen.getByText('Name taken')).toBeInTheDocument();
    expect(mockOnCreate).not.toHaveBeenCalled();
  });
});
