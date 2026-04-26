import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PoweredByNostrWot } from './PoweredByNostrWot';

describe('PoweredByNostrWot', () => {
  it('renders a link to https://nostr-wot.com with rel="noopener noreferrer"', () => {
    render(<PoweredByNostrWot />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://nostr-wot.com');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('contains the "nostr-wot" text', () => {
    render(<PoweredByNostrWot />);
    expect(screen.getByText(/nostr-wot/i)).toBeInTheDocument();
  });

  it('contains the "Powered by" text', () => {
    render(<PoweredByNostrWot />);
    expect(screen.getByText(/Powered by/i)).toBeInTheDocument();
  });
});
