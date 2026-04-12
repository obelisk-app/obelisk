import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RoleBadge from './RoleBadge';

describe('RoleBadge', () => {
  it('renders the base role text', () => {
    render(<RoleBadge role="admin" />);
    expect(screen.getByTestId('role-badge')).toHaveTextContent('admin');
  });

  it('renders owner with green styling', () => {
    render(<RoleBadge role="owner" />);
    const badge = screen.getByTestId('role-badge');
    expect(badge).toHaveTextContent('owner');
    expect(badge.className).toContain('bg-lc-green');
  });

  it('renders member with muted styling', () => {
    render(<RoleBadge role="member" />);
    const badge = screen.getByTestId('role-badge');
    expect(badge.className).toContain('bg-lc-border');
  });

  it('renders custom role badges when provided', () => {
    render(
      <RoleBadge
        role="member"
        customRoles={[
          { id: 'r1', name: 'VIP', color: '#ff0000', priority: 10 },
          { id: 'r2', name: 'Artist', color: '#00ff00', icon: '🎨', priority: 5 },
        ]}
      />,
    );
    const customBadges = screen.getAllByTestId('custom-role-badge');
    expect(customBadges).toHaveLength(2);
    expect(customBadges[0]).toHaveTextContent('VIP');
    expect(customBadges[1]).toHaveTextContent('Artist');
  });

  it('renders custom role icon when present', () => {
    render(
      <RoleBadge
        role="member"
        customRoles={[{ id: 'r1', name: 'Star', color: '#ffcc00', icon: '⭐', priority: 1 }]}
      />,
    );
    expect(screen.getByTestId('custom-role-badge')).toHaveTextContent('⭐');
  });

  it('renders no custom badges when customRoles is empty', () => {
    render(<RoleBadge role="mod" customRoles={[]} />);
    expect(screen.queryAllByTestId('custom-role-badge')).toHaveLength(0);
  });
});
