import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CodeBlock from './CodeBlock';

// Mock shiki to avoid WASM loading in tests
vi.mock('shiki', () => ({
  createHighlighter: vi.fn(() => Promise.reject(new Error('mock'))),
}));

describe('CodeBlock', () => {
  it('renders fallback code block', () => {
    render(<CodeBlock code="const x = 1;" language="javascript" />);
    expect(screen.getByTestId('code-fallback')).toHaveTextContent('const x = 1;');
  });

  it('shows language label', () => {
    render(<CodeBlock code="print('hi')" language="python" />);
    expect(screen.getByText('python')).toBeInTheDocument();
  });

  it('shows copy button on hover', () => {
    render(<CodeBlock code="hello" />);
    expect(screen.getByTestId('copy-code-btn')).toBeInTheDocument();
  });

  it('renders the code block container', () => {
    render(<CodeBlock code="test" />);
    expect(screen.getByTestId('code-block')).toBeInTheDocument();
  });
});
