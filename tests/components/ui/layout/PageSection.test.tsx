import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PageSection from '@/components/ui/layout/PageSection';

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class { observe = vi.fn(); disconnect = vi.fn(); });
});
afterEach(() => { vi.unstubAllGlobals(); });

it.each([false, true])('owns section spacing without an extra animation wrapper (reveal=%s)', (reveal) => {
  const { container } = render(<PageSection reveal={reveal} id="features" data-testid="section" className="border-t">Content</PageSection>);
  const section = screen.getByTestId('section');
  expect(section.tagName).toBe('SECTION');
  expect(section).toHaveClass('px-6', 'py-24', 'border-t');
  expect(container.firstElementChild).toBe(section);
  expect(section).toHaveAttribute('id', 'features');
});
