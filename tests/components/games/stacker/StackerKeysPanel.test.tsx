import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StackerKeysPanel from '@/components/games/stacker/StackerKeysPanel';
import { LocaleProvider } from '@tests/support/intl';

/** The key-binding panel wears the shared modal header and footer. */
describe('StackerKeysPanel chrome', () => {
  it('titles the dialog and closes from the header and from Done', () => {
    const onClose = vi.fn();
    render(<LocaleProvider initialLocale="en"><StackerKeysPanel onClose={onClose} /></LocaleProvider>);
    expect(screen.getByRole('heading', { level: 2, name: 'Controls' })).toBeInTheDocument();
    expect(screen.getByTestId('stacker-keys-reset')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
