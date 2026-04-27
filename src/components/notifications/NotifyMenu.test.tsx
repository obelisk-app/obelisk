import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotifyMenu } from './NotifyMenu';
import { useNotificationPrefsStore } from '@/store/notificationPrefs';

beforeEach(() => {
  // Clear accumulated call history so each test's vi.spyOn() starts fresh.
  vi.clearAllMocks();
  useNotificationPrefsStore.setState({ prefs: [], hydrated: true });
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ pref: null }),
  });
});

describe('NotifyMenu', () => {
  it('renders default state when no pref exists', () => {
    render(<NotifyMenu scope={{ type: 'channel', id: 'ch1' }} title="general" onClose={() => {}} />);
    expect(screen.getByText(/Notifications for #general/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Default \(mentions only\)/i)).toBeChecked();
  });

  it('writes notifyLevel through the store on click', () => {
    const setPrefSpy = vi.spyOn(useNotificationPrefsStore.getState(), 'setPref');
    render(<NotifyMenu scope={{ type: 'channel', id: 'ch1' }} title="general" onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText(/All messages/i));
    expect(setPrefSpy).toHaveBeenCalledWith({ type: 'channel', id: 'ch1' }, expect.objectContaining({ notifyLevel: 'all' }));
  });

  it('writes mutedUntil when a duration is picked', () => {
    const setPrefSpy = vi.spyOn(useNotificationPrefsStore.getState(), 'setPref');
    render(<NotifyMenu scope={{ type: 'channel', id: 'ch1' }} title="general" onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText(/8 hours/i));
    const arg = setPrefSpy.mock.calls[0][1];
    expect(arg.mutedUntil).toBeTruthy();
    expect(new Date(arg.mutedUntil!).getTime()).toBeGreaterThan(Date.now());
  });

  it('reset button calls resetPref', () => {
    const resetSpy = vi.spyOn(useNotificationPrefsStore.getState(), 'resetPref');
    render(<NotifyMenu scope={{ type: 'channel', id: 'ch1' }} title="general" onClose={() => {}} />);
    fireEvent.click(screen.getByText(/Reset to default/i));
    expect(resetSpy).toHaveBeenCalledWith({ type: 'channel', id: 'ch1' });
  });

  it('renders server-style header for server scope', () => {
    render(<NotifyMenu scope={{ type: 'server', id: 's1' }} title="La Crypta" onClose={() => {}} />);
    expect(screen.getByText(/Notifications for La Crypta/i)).toBeInTheDocument();
  });
});
