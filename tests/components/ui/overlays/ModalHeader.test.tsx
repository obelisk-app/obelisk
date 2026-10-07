import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import ModalHeader from '@/components/ui/overlays/ModalHeader';

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

describe('ModalHeader shapes', () => {
  it('draws an icon and a back button before the title, and controls before the close button', () => {
    const onBack = vi.fn();
    render(
      <LocaleProvider initialLocale="en">
        <ModalHeader title="Zap" icon={<svg data-testid="glyph" />} onBack={onBack} onClose={() => {}}>
          <span data-testid="extra" />
        </ModalHeader>
      </LocaleProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    const header = screen.getByRole('banner');
    const order = [...header.querySelectorAll('[data-testid], h2, button')].map((n) => n.getAttribute('data-testid') ?? n.tagName);
    expect(order).toEqual(['BUTTON', 'glyph', 'H2', 'extra', 'BUTTON']);
  });

  it('has no close button without onClose', () => {
    render(<LocaleProvider initialLocale="en"><ModalHeader title="t" /></LocaleProvider>);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('centres an alert under a tinted icon, with ids for the dialog to point at', () => {
    render(
      <LocaleProvider initialLocale="en">
        <ModalHeader variant="alert" tone="warning" icon={<svg />} title="Heads up" subtitle="Body" titleId="t1" subtitleId="m1" />
      </LocaleProvider>,
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveAttribute('id', 't1');
    expect(screen.getByText('Body')).toHaveAttribute('id', 'm1');
    expect(screen.getByRole('banner')).toHaveClass('text-center');
    expect(screen.getByRole('banner').querySelector('[aria-hidden="true"]')).toHaveClass('text-yellow-300');
  });

  it('hides a decorative icon from screen readers, and announces one that names itself', () => {
    const { rerender } = render(
      <LocaleProvider initialLocale="en"><ModalHeader title="t" icon={<span role="img" aria-label="Vesta preview" />} /></LocaleProvider>,
    );
    expect(screen.queryByRole('img', { name: 'Vesta preview' })).toBeNull();
    rerender(
      <LocaleProvider initialLocale="en"><ModalHeader title="t" decorativeIcon={false} icon={<span role="img" aria-label="Vesta preview" />} /></LocaleProvider>,
    );
    expect(screen.getByRole('img', { name: 'Vesta preview' })).toBeInTheDocument();
  });
});
