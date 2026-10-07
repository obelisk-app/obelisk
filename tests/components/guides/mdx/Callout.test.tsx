import { describe, it, expect } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { LocaleProvider } from '@tests/support/intl';
import type { Locale } from '@/i18n';
import Callout from '@/components/guides/mdx/Callout';

const render = (ui: ReactElement, locale: Locale = 'en') =>
  rtlRender(<LocaleProvider initialLocale={locale}>{ui}</LocaleProvider>);

describe('Callout', () => {
  it('renders children', () => {
    render(<Callout>Hello</Callout>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('applies variant data-testid', () => {
    render(<Callout type="warn">warn me</Callout>);
    expect(screen.getByTestId('callout-warn')).toBeInTheDocument();
    expect(screen.getByText('Heads up')).toBeInTheDocument();
  });

  it('labels the variant in the reader\'s language', () => {
    render(<Callout type="warn">ojo</Callout>, 'es');
    expect(screen.getByText('Atención')).toBeInTheDocument();
  });

  it('shows custom title when provided', () => {
    render(
      <Callout type="info" title="Custom Label">
        body
      </Callout>,
    );
    expect(screen.getByText('Custom Label')).toBeInTheDocument();
  });
});
