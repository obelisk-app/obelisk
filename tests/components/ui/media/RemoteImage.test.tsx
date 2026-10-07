import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RemoteImage from '@/components/ui/media/RemoteImage';

describe('RemoteImage', () => {
  it('never sends a referrer, and loads lazily by default', () => {
    render(<RemoteImage src="https://cdn.example/a.png" alt="avatar" />);
    const img = screen.getByAltText('avatar');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('src', 'https://cdn.example/a.png');
  });

  it('cannot be talked into sending a referrer, even by a prop smuggled past the type', () => {
    const smuggled = { referrerPolicy: 'unsafe-url' } as object;
    render(<RemoteImage src="https://cdn.example/a.png" alt="x" {...smuggled} />);
    expect(screen.getByAltText('x')).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('lets a caller load eagerly and passes styling and handlers through', () => {
    const onError = vi.fn();
    render(<RemoteImage src="https://cdn.example/b.png" alt="" loading="eager" className="h-8 w-8" onError={onError} data-testid="img" />);
    const img = screen.getByTestId('img');
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveClass('h-8', 'w-8');
    fireEvent.error(img);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
