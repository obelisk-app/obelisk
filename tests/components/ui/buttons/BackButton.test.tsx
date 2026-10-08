import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import BackButton from '@/components/ui/buttons/BackButton';

const en = (node: React.ReactNode) => render(<LocaleProvider initialLocale="en">{node}</LocaleProvider>);

describe('mobile BackButton', () => {
  it('is the stylesheet back button with the shared chevron and a translated name', () => {
    const onClick = vi.fn();
    en(<BackButton onClick={onClick} data-testid="b" />);
    const button = screen.getByRole('button', { name: 'Back' });
    expect(button).toHaveClass('back-btn');
    expect(button).toHaveAttribute('type', 'button');
    expect(button.querySelector('path')).toHaveAttribute('d', 'm15 18-6-6 6-6');
    expect(button.querySelector('svg')).toHaveAttribute('stroke-width', '2');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('takes a custom label and can be disabled', () => {
    const onClick = vi.fn();
    en(<BackButton onClick={onClick} label="Leave" disabled />);
    const button = screen.getByRole('button', { name: 'Leave' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

