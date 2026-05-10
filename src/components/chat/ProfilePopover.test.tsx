import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import ProfilePopover from './ProfilePopover';
import { useChatStore } from '@/store/chat';

vi.mock('@nostr-wot/data/react', () => ({
  useProfile: () => null,
  usePubkey: () => null,
}));

vi.mock('@nostr-wot/data', () => ({
  formatPubkey: vi.fn((pk: string) => `${pk.slice(0, 8)}…`),
  // Faithful enough for the npub1-prefix assertion below; real encoding isn't
  // needed since the test only checks the `npub1` prefix survives the format.
  hexToNpub: vi.fn((pk: string) => `npub1${pk}`),
}));

describe('ProfilePopover', () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState());
  });

  const setMember = (overrides: Partial<Parameters<typeof useChatStore.setState>[0]> = {}) => {
    useChatStore.setState({
      memberList: [
        {
          pubkey: 'pk1',
          displayName: 'AndyCreed',
          picture: 'https://example.com/pic.jpg',
          banner: 'https://example.com/banner.jpg',
          nip05: 'andycreed@example.com',
          about: 'Building stuff',
          role: 'admin',
          joinedAt: '2025-06-15T00:00:00.000Z',
          customRoles: [
            { id: 'r1', name: 'Descentralizador', color: '#f59e0b', icon: null, priority: 10 },
            { id: 'r2', name: 'Minero', color: '#ef4444', icon: null, priority: 5 },
          ],
        },
      ],
      ...overrides,
    } as any);
  };

  it('renders display name, handle, about, roles and joined date', () => {
    setMember();
    render(<ProfilePopover pubkey="pk1" onClose={() => {}} />);

    expect(screen.getByTestId('profile-name').textContent).toBe('AndyCreed');
    expect(screen.getByTestId('profile-handle').textContent).toContain('andycreed@example.com');
    expect(screen.getByTestId('profile-about').textContent).toBe('Building stuff');
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Descentralizador')).toBeInTheDocument();
    expect(screen.getByText('Minero')).toBeInTheDocument();
    expect(screen.getByTestId('profile-joined').textContent).not.toBe('—');
  });

  it('renders banner background when banner is set', () => {
    setMember();
    render(<ProfilePopover pubkey="pk1" onClose={() => {}} />);
    const banner = screen.getByTestId('profile-banner') as HTMLElement;
    expect(banner.style.backgroundImage).toContain('banner.jpg');
  });

  it('falls back to short npub when member is not in memberList', () => {
    const pk = 'deadbeef'.repeat(8);
    render(<ProfilePopover pubkey={pk} onClose={() => {}} />);
    expect(screen.getByTestId('profile-handle').textContent).toMatch(/npub1/);
    expect(screen.getByTestId('profile-joined').textContent).toBe('—');
  });

it('calls onClose when backdrop is clicked', () => {
    setMember();
    const onClose = vi.fn();
    render(<ProfilePopover pubkey="pk1" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('profile-popover-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onClose when panel content is clicked', () => {
    setMember();
    const onClose = vi.fn();
    render(<ProfilePopover pubkey="pk1" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('profile-popover'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
