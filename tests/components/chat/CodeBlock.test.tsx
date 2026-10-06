import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, it, expect } from 'vitest';
import { LocaleProvider } from '@/i18n/context';
import CodeBlock from '@/components/chat/CodeBlock';

const renderLocalized = (ui: ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);

describe('CodeBlock', () => {
  it('renders fallback code block', () => {
    renderLocalized(<CodeBlock code="const x = 1;" language="javascript" />);
    expect(screen.getByTestId('code-fallback')).toHaveTextContent('const x = 1;');
  });

  it('shows language label', () => {
    renderLocalized(<CodeBlock code="print('hi')" language="python" />);
    expect(screen.getByText('python')).toBeInTheDocument();
  });

  it('shows copy button on hover', () => {
    renderLocalized(<CodeBlock code="hello" />);
    expect(screen.getByTestId('copy-code-btn')).toBeInTheDocument();
  });

  it('names the copy button after what it copies', () => {
    renderLocalized(<CodeBlock code="print('hi')" language="python" />);
    expect(screen.getByTestId('copy-code-btn')).toHaveAccessibleName('Copy python');
  });

  it('renders the code block container', () => {
    renderLocalized(<CodeBlock code="test" />);
    expect(screen.getByTestId('code-block')).toBeInTheDocument();
  });
});
