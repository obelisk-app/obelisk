import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '@tests/support/intl';
import { RehydratingScreen } from '@/app/[locale]/app/mobile/screens/status/RehydratingScreen';
import { EmptyScreen } from '@/app/[locale]/app/mobile/screens/status/EmptyScreen';

describe('the phone status screens', () => {
  it('says it is reconnecting while a stored session comes back', () => {
    render(<LocaleProvider initialLocale="en"><RehydratingScreen /></LocaleProvider>);
    expect(document.querySelector('.conn-spinner')).not.toBeNull();
  });

  it('shows the empty screen title and one way home', () => {
    const go = vi.fn();
    render(<LocaleProvider initialLocale="en"><EmptyScreen go={go} title="Nothing here" /></LocaleProvider>);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(go).toHaveBeenCalledWith('server');
  });
});
