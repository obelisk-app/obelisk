import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import BanReasonDialog from './BanReasonDialog';

describe('BanReasonDialog', () => {
  it('renders member name and textarea', () => {
    render(<BanReasonDialog memberName="Alice" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/Ban Alice/)).toBeInTheDocument();
    expect(screen.getByTestId('ban-reason-input')).toBeInTheDocument();
  });

  it('calls onConfirm with reason text', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<BanReasonDialog memberName="Alice" onConfirm={onConfirm} onCancel={vi.fn()} />);

    await user.type(screen.getByTestId('ban-reason-input'), 'Spam');
    await user.click(screen.getByTestId('ban-confirm-btn'));

    expect(onConfirm).toHaveBeenCalledWith('Spam');
  });

  it('calls onCancel when cancel clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<BanReasonDialog memberName="Alice" onConfirm={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});
