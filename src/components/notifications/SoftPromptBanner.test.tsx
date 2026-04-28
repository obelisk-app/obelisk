import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SoftPromptBanner } from './SoftPromptBanner';

beforeEach(() => {
  globalThis.localStorage.clear();
  (globalThis as any).Notification = {
    permission: 'default' as NotificationPermission,
    requestPermission: vi.fn().mockResolvedValue('granted' as NotificationPermission),
  };
  vi.useFakeTimers();
});

describe('SoftPromptBanner', () => {
  it('does not render before 60s elapsed', () => {
    render(<SoftPromptBanner />);
    expect(screen.queryByText(/Get notified/i)).toBeNull();
  });

  it('renders after 60s when permission is default and not dismissed', () => {
    render(<SoftPromptBanner />);
    act(() => { vi.advanceTimersByTime(61_000); });
    expect(screen.queryByText(/Get notified/i)).toBeInTheDocument();
  });

  it('"Not now" hides the banner for the rest of the session', () => {
    render(<SoftPromptBanner />);
    act(() => { vi.advanceTimersByTime(61_000); });
    fireEvent.click(screen.getByText(/Not now/i));
    expect(screen.queryByText(/Get notified/i)).toBeNull();
  });

  it('"Don’t ask again" persists dismissal to localStorage', () => {
    render(<SoftPromptBanner />);
    act(() => { vi.advanceTimersByTime(61_000); });
    fireEvent.click(screen.getByText(/Don.t ask again/i));
    expect(globalThis.localStorage.getItem('obelisk:notif-prompt-dismissed')).toBe('true');
  });

  it('does not render when permission is granted', () => {
    (globalThis as any).Notification.permission = 'granted';
    render(<SoftPromptBanner />);
    act(() => { vi.advanceTimersByTime(61_000); });
    expect(screen.queryByText(/Get notified/i)).toBeNull();
  });
});
