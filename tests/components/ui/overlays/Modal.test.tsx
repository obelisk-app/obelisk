import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Modal from '@/components/ui/overlays/Modal';

describe('Modal', () => {
  it('renders the panel contents inside the backdrop', () => {
    render(
      <Modal onClose={() => {}} testId="shell">
        <div data-testid="inner">body</div>
      </Modal>,
    );
    expect(screen.getByTestId('shell')).toBeInTheDocument();
    expect(screen.getByTestId('inner')).toBeInTheDocument();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose} testId="shell"><div>x</div></Modal>);
    fireEvent.click(screen.getByTestId('shell'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when the panel is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} testId="shell">
        <button data-testid="inner">x</button>
      </Modal>,
    );
    fireEvent.click(screen.getByTestId('inner'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('skips backdrop dismiss when closeOnBackdrop is false', () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} closeOnBackdrop={false} testId="shell">
        <div>x</div>
      </Modal>,
    );
    fireEvent.click(screen.getByTestId('shell'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose on Escape by default', () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose}><div>x</div></Modal>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape when closeOnEscape is false', () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose} closeOnEscape={false}><div>x</div></Modal>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores other keys', () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose}><div>x</div></Modal>);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

it('applies the shared card surface to the existing dialog panel', () => {
  const onClose = vi.fn();
  render(<Modal surface="card" panelClassName="max-w-xl" onClose={onClose} testId="card-modal" aria-label="Settings">Body</Modal>);
  const dialog = screen.getByRole('dialog', { name: 'Settings' });
  expect(dialog).toHaveClass('lc-card', 'max-w-xl');
  expect(dialog.parentElement).toBe(screen.getByTestId('card-modal'));
  fireEvent.click(dialog);
  expect(onClose).not.toHaveBeenCalled();
});
