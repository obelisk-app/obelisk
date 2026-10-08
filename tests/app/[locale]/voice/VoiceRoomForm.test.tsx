import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

const push = vi.fn();
vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock({ useRouter: () => ({ push }) }));

import VoiceLandingPage from '@/app/[locale]/voice/VoiceRoomForm';

function mount() {
  render(<LocaleProvider initialLocale="en"><VoiceLandingPage /></LocaleProvider>);
}

describe('/voice landing page', () => {
  it('starts on the "test" room and routes to the typed room on submit', () => {
    mount();
    const input = screen.getByPlaceholderText('room name');
    expect(input).toHaveValue('test');
    fireEvent.change(input, { target: { value: 'my room' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }));
    expect(push).toHaveBeenCalledWith('/voice/my%20room');
  });

  it('does nothing for a blank name', () => {
    push.mockClear();
    mount();
    fireEvent.change(screen.getByPlaceholderText('room name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }));
    expect(push).not.toHaveBeenCalled();
  });

  it('names the room input for screen readers', () => {
    mount();
    expect(screen.getByRole('textbox', { name: 'room name' })).toBe(screen.getByPlaceholderText('room name'));
  });

  it('explains the test in the page language, from the messages', () => {
    render(<LocaleProvider initialLocale="es"><VoiceLandingPage /></LocaleProvider>);
    expect(screen.getByText(/Escribí el mismo nombre en dos dispositivos/)).toBeInTheDocument();
  });
});
