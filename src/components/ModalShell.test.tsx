import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ModalShell from './ModalShell';

describe('ModalShell', () => {
  it('renders the panel contents inside the backdrop', () => {
    render(
      <ModalShell onClose={() => {}} testId="shell">
        <div data-testid="inner">body</div>
      </ModalShell>,
    );
    expect(screen.getByTestId('shell')).toBeInTheDocument();
    expect(screen.getByTestId('inner')).toBeInTheDocument();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<ModalShell onClose={onClose} testId="shell"><div>x</div></ModalShell>);
    fireEvent.click(screen.getByTestId('shell'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when the panel is clicked', () => {
    const onClose = vi.fn();
    render(
      <ModalShell onClose={onClose} testId="shell">
        <button data-testid="inner">x</button>
      </ModalShell>,
    );
    fireEvent.click(screen.getByTestId('inner'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('skips backdrop dismiss when closeOnBackdrop is false', () => {
    const onClose = vi.fn();
    render(
      <ModalShell onClose={onClose} closeOnBackdrop={false} testId="shell">
        <div>x</div>
      </ModalShell>,
    );
    fireEvent.click(screen.getByTestId('shell'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose on Escape by default', () => {
    const onClose = vi.fn();
    render(<ModalShell onClose={onClose}><div>x</div></ModalShell>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape when closeOnEscape is false', () => {
    const onClose = vi.fn();
    render(<ModalShell onClose={onClose} closeOnEscape={false}><div>x</div></ModalShell>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores other keys', () => {
    const onClose = vi.fn();
    render(<ModalShell onClose={onClose}><div>x</div></ModalShell>);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
