import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import ProfileLinks from '@/components/chat/profile/ProfileLinks';
import { useToastStore } from '@/store/feedback/toast';

const renderLocalized = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);

describe('ProfileLinks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useToastStore.setState({ toasts: [] } as never);
  });

  it('renders nothing with nothing to show', () => {
    const { container } = renderLocalized(<ProfileLinks about="" website={null} lud16={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('bio links open in a new tab only for web links', () => {
    renderLocalized(<ProfileLinks about="see https://a.example and mail me@x.example" />);
    const links = screen.getAllByTestId('profile-bio-link');
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByTestId('profile-links').textContent).toContain('see ');
  });

  it('copies the lightning address and says so', () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderLocalized(<ProfileLinks lud16="me@wallet.example" />);
    fireEvent.click(screen.getByTestId('profile-lud16'));
    expect(writeText).toHaveBeenCalledWith('me@wallet.example');
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ title: 'Lightning address copied', body: 'me@wallet.example' });
  });

  it('still says so when there is no clipboard API', () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    renderLocalized(<ProfileLinks lud16="me@wallet.example" />);
    fireEvent.click(screen.getByTestId('profile-lud16'));
    expect(useToastStore.getState().toasts.at(-1)?.body).toBe('me@wallet.example');
  });
});
