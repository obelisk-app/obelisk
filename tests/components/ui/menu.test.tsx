import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MenuItem, MenuLink } from '@/components/ui/menu';

describe('MenuLink', () => {
  it('opens an outside page in a new tab by default', () => {
    render(<MenuLink label="Profile page" href="https://example.com/p" />);
    const link = screen.getByRole('menuitem', { name: 'Profile page' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer noopener');
  });

  it('newTab={false} stays in the app', () => {
    render(<MenuLink label="Open app" href="/app" newTab={false} />);
    const link = screen.getByRole('menuitem', { name: 'Open app' });
    expect(link).toHaveAttribute('href', '/app');
    expect(link).not.toHaveAttribute('target');
    expect(link).not.toHaveAttribute('rel');
  });
});

describe('MenuItem', () => {
  it('is a typed menuitem button; danger rows are red', () => {
    const onClick = vi.fn();
    render(<MenuItem label="Log out" danger onClick={onClick} />);
    const row = screen.getByRole('menuitem', { name: 'Log out' });
    expect(row).toHaveAttribute('type', 'button');
    expect(row).toHaveClass('text-red-400');
    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('MenuItem as a checkbox row', () => {
  it('exposes menuitemcheckbox with aria-checked and passes data attributes through', () => {
    render(
      <MenuItem
        label="Relays"
        role="menuitemcheckbox"
        onClick={() => {}}
        buttonProps={{ 'aria-checked': true, 'data-widget': 'relays' }}
      />,
    );
    const row = screen.getByRole('menuitemcheckbox', { name: 'Relays', checked: true });
    expect(row).toHaveAttribute('data-widget', 'relays');
  });
});
