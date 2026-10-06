import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Overlay from '@/components/ui/Overlay';

describe('Overlay', () => {
  it('portals to the body when asked and stays in place when not', () => {
    const { container, unmount } = render(
      <Overlay onClose={() => {}} backdropClassName="bd" portal testId="o"><span>x</span></Overlay>,
    );
    expect(container.querySelector('[data-testid="o"]')).toBeNull();
    expect(screen.getByTestId('o').parentElement).toBe(document.body);
    unmount();
    render(<Overlay onClose={() => {}} backdropClassName="bd" portal={false} testId="o"><span>x</span></Overlay>);
    expect(screen.getByTestId('o').parentElement).not.toBe(document.body);
  });

  it('closes on backdrop click and Escape, each switchable off', () => {
    const onClose = vi.fn();
    const { rerender } = render(<Overlay onClose={onClose} backdropClassName="bd" portal={false} testId="o">x</Overlay>);
    fireEvent.click(screen.getByTestId('o'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    rerender(<Overlay onClose={onClose} backdropClassName="bd" portal={false} testId="o" closeOnBackdrop={false} closeOnEscape={false}>x</Overlay>);
    fireEvent.click(screen.getByTestId('o'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
