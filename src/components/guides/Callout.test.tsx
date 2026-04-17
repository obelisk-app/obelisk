import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Callout from './Callout';

describe('Callout', () => {
  it('renders children', () => {
    render(<Callout>Hello</Callout>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('applies variant data-testid', () => {
    render(<Callout type="warn">warn me</Callout>);
    expect(screen.getByTestId('callout-warn')).toBeInTheDocument();
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
