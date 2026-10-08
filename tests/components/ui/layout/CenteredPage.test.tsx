import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CenteredPage from '@/components/ui/layout/CenteredPage';

describe('CenteredPage', () => {
  it('centres its card on a full-height black page', () => {
    render(<CenteredPage><span>card</span></CenteredPage>);
    const page = screen.getByText('card').parentElement!;
    expect(page).toHaveClass('min-h-dvh', 'items-center', 'justify-center', 'bg-black');
  });
});
