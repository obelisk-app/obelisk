import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RoleBadge from './RoleBadge';

describe('RoleBadge', () => {
  it('renders the role text', () => {
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
});
