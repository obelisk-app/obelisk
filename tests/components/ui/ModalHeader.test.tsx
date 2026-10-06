import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';
import ModalHeader from '@/components/ui/ModalHeader';

describe('ModalHeader', () => {
  it('renders a heading, a subtitle and a labelled close button', () => {
    const onClose = vi.fn();
    render(
      <LocaleProvider initialLocale="en">
        <ModalHeader title="Relay settings" subtitle="Operator only" onClose={onClose}>
          <button>extra</button>
        </ModalHeader>
      </LocaleProvider>,
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Relay settings');
    expect(screen.getByText('Operator only')).toHaveClass('text-lc-muted');
    expect(screen.getByRole('button', { name: 'extra' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ModalHeader close button', () => {
  it('draws the close icon, not the glyph, at the glyph button footprint', () => {
    render(
      <LocaleProvider initialLocale="en">
        <ModalHeader title="t" onClose={() => {}} />
      </LocaleProvider>,
    );
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).not.toHaveTextContent('✕');
    expect(close.querySelector('svg')).not.toBeNull();
    expect(close).toHaveClass('h-8', 'w-8');
  });
});
