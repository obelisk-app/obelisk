import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';
import CloseButton from '@/components/ui/CloseButton';

const renderEn = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);

describe('CloseButton', () => {
  it('is a typed ghost button named Close with the icon', () => {
    const onClick = vi.fn();
    renderEn(<CloseButton onClick={onClick} />);
    const el = screen.getByRole('button', { name: 'Close' });
    expect(el).toHaveAttribute('type', 'button');
    expect(el).toHaveClass('text-lc-muted', 'focus-visible:ring-2', 'h-8', 'w-8');
    expect(el.querySelector('svg')).toHaveAttribute('width', '16');
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('sm is the 24px row size with a 14px icon', () => {
    renderEn(<CloseButton onClick={() => {}} size="sm" />);
    const el = screen.getByRole('button');
    expect(el).toHaveClass('h-6', 'w-6');
    expect(el.querySelector('svg')).toHaveAttribute('width', '14');
  });

  it('takes a specific label', () => {
    renderEn(<CloseButton onClick={() => {}} label="Dismiss tip" />);
    expect(screen.getByRole('button', { name: 'Dismiss tip' })).toBeInTheDocument();
  });
});
