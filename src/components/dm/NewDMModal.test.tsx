import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import NewDMModal from './NewDMModal';
import { useDMStore } from '@/store/dm';

const profileCache = new Map<string, { name?: string; picture?: string }>();
profileCache.set('abc123'.padEnd(64, '0'), { name: 'Alice' });

describe('NewDMModal', () => {
  beforeEach(() => {
    useDMStore.setState(useDMStore.getInitialState());
  });

  it('renders input and buttons', () => {
    render(<NewDMModal onClose={vi.fn()} profileCache={profileCache} />);
    expect(screen.getByTestId('new-dm-pubkey-input')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByTestId('start-dm-btn')).toBeInTheDocument();
  });

  it('start button is disabled when input empty', () => {
    render(<NewDMModal onClose={vi.fn()} profileCache={profileCache} />);
    expect(screen.getByTestId('start-dm-btn')).toBeDisabled();
  });

  it('starts chat with valid hex pubkey', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const hexPk = 'a'.repeat(64);

    render(<NewDMModal onClose={onClose} profileCache={profileCache} />);
    await user.type(screen.getByTestId('new-dm-pubkey-input'), hexPk);
    await user.click(screen.getByTestId('start-dm-btn'));

    expect(useDMStore.getState().activeDMPubkey).toBe(hexPk);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows error on invalid input', async () => {
    const user = userEvent.setup();
    render(<NewDMModal onClose={vi.fn()} profileCache={profileCache} />);
    await user.type(screen.getByTestId('new-dm-pubkey-input'), 'invalid-key');
    await user.click(screen.getByTestId('start-dm-btn'));

    expect(screen.getByTestId('new-dm-error')).toBeInTheDocument();
    expect(useDMStore.getState().activeDMPubkey).toBeNull();
  });

  it('closes on Cancel click', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<NewDMModal onClose={onClose} profileCache={profileCache} />);
    await user.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<NewDMModal onClose={onClose} profileCache={profileCache} />);
    // Click the backdrop (outermost fixed div)
    const backdrop = container.firstElementChild as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
