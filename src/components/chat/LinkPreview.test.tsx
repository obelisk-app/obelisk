import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LinkPreview from './LinkPreview';

// Clear module-level cache between tests
beforeEach(() => {
  vi.restoreAllMocks();
});

describe('LinkPreview', () => {
  it('shows loading skeleton initially', () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {})); // never resolves
    render(<LinkPreview url="https://example.com" />);
    expect(screen.getByTestId('link-preview-loading')).toBeInTheDocument();
  });

  it('renders preview card when data is fetched', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ title: 'Example', description: 'A test site', siteName: 'Example.com' }),
    } as Response);

    render(<LinkPreview url="https://unique-test-url.com" />);

    await waitFor(() => {
      expect(screen.getByTestId('link-preview')).toBeInTheDocument();
    });
    expect(screen.getByText('Example')).toBeInTheDocument();
    expect(screen.getByText('A test site')).toBeInTheDocument();
  });

  it('renders nothing on fetch error', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const { container } = render(<LinkPreview url="https://error-test.com" />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="link-preview-loading"]')).not.toBeInTheDocument();
    });
    expect(container.querySelector('[data-testid="link-preview"]')).not.toBeInTheDocument();
  });
});
