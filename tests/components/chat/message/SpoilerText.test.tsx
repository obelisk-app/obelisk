import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { LocaleProvider } from '@tests/support/intl';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import SpoilerText from '@/components/chat/message/SpoilerText';


/** The component reads its copy from the dictionary, so it needs a provider. */
const Wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;
const renderLocalized = (ui: ReactElement) => render(ui, { wrapper: Wrapper });
describe('SpoilerText', () => {
  it('renders with hidden text by default', () => {
    renderLocalized(<SpoilerText>secret</SpoilerText>);
    const el = screen.getByTestId('spoiler-text');
    expect(el).toHaveClass('text-transparent');
    expect(el).toHaveTextContent('secret');
  });

  it('reveals text on click', async () => {
    const user = userEvent.setup();
    renderLocalized(<SpoilerText>secret</SpoilerText>);
    const el = screen.getByTestId('spoiler-text');
    await user.click(el);
    expect(el).toHaveClass('text-lc-white');
    expect(el).not.toHaveClass('text-transparent');
  });

  it('reveals text on Enter key', async () => {
    const user = userEvent.setup();
    renderLocalized(<SpoilerText>secret</SpoilerText>);
    const el = screen.getByTestId('spoiler-text');
    el.focus();
    await user.keyboard('{Enter}');
    expect(el).toHaveClass('text-lc-white');
  });
});
