import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ToggleCard from '@/components/ui/forms/ToggleCard';

describe('ToggleCard', () => {
  it('announces selection and leaves it controlled by the caller without submitting forms', () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const { rerender } = render(
      <form onSubmit={onSubmit}>
        <ToggleCard active={false} title="Public" subtitle="Anyone can join" icon="🌐" onClick={onClick} />
      </form>,
    );
    const card = screen.getByRole('button', { name: 'Public Anyone can join', pressed: false });
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(card).toHaveAttribute('aria-pressed', 'false');
    rerender(<ToggleCard active title="Public" />);
    expect(screen.getByRole('button', { name: 'Public', pressed: true })).toBeInTheDocument();
  });

  it('supports disabled controls through the shared button', () => {
    const onClick = vi.fn();
    render(<ToggleCard active={false} title="Private" disabled onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Private' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
