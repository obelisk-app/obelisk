import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RoleIcon from './RoleIcon';

describe('RoleIcon', () => {
  it('renders nothing for a plain member with no custom roles', () => {
    const { container } = render(<RoleIcon member={{ role: 'member', customRoles: [] }} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the default emoji for a base role (owner) with its label as tooltip', () => {
    render(<RoleIcon member={{ role: 'owner', customRoles: [] }} />);
    const el = screen.getByTestId('role-icon');
    expect(el).toHaveAttribute('title', 'Owner');
    expect(el.textContent).toContain('👑');
  });

  it('prefers a custom role icon over the base role when its priority wins', () => {
    render(
      <RoleIcon
        member={{
          role: 'member',
          customRoles: [
            { id: 'r1', name: 'VIP', color: '#ff0', icon: '⭐', priority: 500 },
          ],
        }}
      />,
    );
    const el = screen.getByTestId('role-icon');
    expect(el).toHaveAttribute('title', 'VIP');
    expect(el.textContent).toContain('⭐');
  });

  it('renders an <img> when the icon is a URL', () => {
    render(
      <RoleIcon
        member={{
          role: 'member',
          customRoles: [
            { id: 'r1', name: 'Artist', color: '#ff0', icon: 'https://example.com/a.png', priority: 500 },
          ],
        }}
      />,
    );
    const img = screen.getByTestId('role-icon').querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.com/a.png');
  });

  it('falls back to base role emoji when the winning custom role has no icon', () => {
    render(
      <RoleIcon
        member={{
          role: 'admin',
          customRoles: [
            { id: 'r1', name: 'Team Lead', color: '#fff', priority: 500 },
          ],
        }}
      />,
    );
    const el = screen.getByTestId('role-icon');
    // Tooltip uses the winning custom role's name, icon falls back to admin's default
    expect(el).toHaveAttribute('title', 'Team Lead');
    expect(el.textContent).toContain('🛡️');
  });
});
