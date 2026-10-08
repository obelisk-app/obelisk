import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Sheet from '@/components/ui/overlays/Sheet';

describe('Sheet', () => {
  it('renders the mobile sheet markup the shell CSS keys on', () => {
    const { container } = render(
      <Sheet onClose={() => {}} screen="add-relay" label="Add relay" testId="s">
        <p>body</p>
      </Sheet>,
    );
    const host = screen.getByTestId('s');
    expect(host).toHaveClass('sheet-host');
    expect(host).toHaveAttribute('data-screen', 'add-relay');
    expect(host.parentElement).toBe(container);
    expect(host.querySelector('.sheet-backdrop')).not.toBeNull();
    const panel = screen.getByRole('dialog', { name: 'Add relay' });
    expect(panel).toHaveClass('sheet', 'native-scroll-y');
    expect(panel.firstElementChild).toHaveClass('sheet-handle');
    expect(panel).toHaveTextContent('body');
  });

  it('closes on backdrop tap and on Escape, but not on a tap inside', () => {
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} screen="x" label="X" testId="s"><button>in</button></Sheet>);
    fireEvent.click(screen.getByRole('button', { name: 'in' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('s').querySelector('.sheet-backdrop')!);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('applies maxHeight and zIndex; a form inside it is a Form, never the panel', () => {
    render(
      <Sheet onClose={() => {}} screen="x" label="X" testId="s" maxHeight="94%" zIndex={20}>
        <span>body</span>
      </Sheet>,
    );
    expect(screen.getByTestId('s')).toHaveStyle({ zIndex: 20 });
    const panel = screen.getByRole('dialog');
    expect(panel.tagName).toBe('DIV');
    expect(panel).toHaveStyle({ maxHeight: '94%' });
  });
});

describe('Sheet stacking', () => {
  it('renders a stacked sheet inside the host as a sibling of the panel', () => {
    render(
      <Sheet onClose={() => {}} screen="relay-menu" label="Relay" testId="s" stacked={<div data-testid="stacked" />}>
        <p>body</p>
      </Sheet>,
    );
    const host = screen.getByTestId('s');
    const stacked = screen.getByTestId('stacked');
    expect(stacked.parentElement).toBe(host);
    expect(screen.getByRole('dialog').contains(stacked)).toBe(false);
  });
});
