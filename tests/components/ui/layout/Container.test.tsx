import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import Container from '@/components/ui/layout/Container';

it('owns centered content width while preserving the semantic element and attributes', () => {
  render(<Container as="main" width="3xl" centeredText id="content" className="py-8">Content</Container>);
  const main = screen.getByRole('main');
  expect(main).toHaveClass('mx-auto', 'max-w-3xl', 'text-center', 'py-8');
  expect(main).toHaveAttribute('id', 'content');
});
