import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { useHintsStore } from '@/store/hints';
import { useToastStore } from '@/store/feedback/toast';
import { SettingsPrefsScreen } from '@/app/[locale]/app/mobile/screens/settings/SettingsPrefsScreen';

vi.mock('@/components/media/library/MediaLibraryModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => <button data-testid="media-library-stub" onClick={onClose} />,
}));

function mount(methods: Record<string, unknown> = {}) {
  const go = vi.fn();
  renderWithBridge(<SettingsPrefsScreen go={go} />, fakeBridge({}, methods as never));
  return { go };
}

beforeEach(() => useToastStore.setState({ toasts: [] }));

describe('SettingsPrefsScreen (phone) actions', () => {
  it('goes back to the profile', () => {
    const { go } = mount();
    fireEvent.click(screen.getByTestId('prefs-back'));
    expect(go).toHaveBeenCalledWith('settings-profile', 'back');
  });

  it('replays the hints and says so', () => {
    const resetHints = vi.fn();
    useHintsStore.setState({ resetHints } as never);
    mount();
    fireEvent.click(screen.getByTestId('mobile-replay-hints'));
    expect(resetHints).toHaveBeenCalledTimes(1);
    const { toasts } = useToastStore.getState();
    expect(toasts.at(-1)).toMatchObject({ body: '' });
    expect(toasts.at(-1)?.title).toBeTruthy();
  });

  it('opens and closes the media library', () => {
    mount();
    fireEvent.click(screen.getByTestId('mobile-media-library'));
    fireEvent.click(screen.getByTestId('media-library-stub'));
    expect(screen.queryByTestId('media-library-stub')).toBeNull();
  });

  it('opens the appearance submenu and comes back', () => {
    mount();
    fireEvent.click(screen.getByTestId('mobile-appearance-submenu'));
    expect(document.querySelector('[data-screen="settings-appearance"]')).not.toBeNull();
    fireEvent.click(document.querySelector('[data-screen="settings-appearance"] .app-header button')!);
    expect(document.querySelector('[data-screen="settings-prefs"]')).not.toBeNull();
  });

  it('logs out only after the disconnect is confirmed', () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    mount({ logout });
    fireEvent.click(screen.getByTestId('disconnect-btn'));
    expect(logout).not.toHaveBeenCalled();
    expect(document.querySelector('[data-screen="settings-prefs"]')).not.toBeNull();
    fireEvent.click(screen.getByTestId('disconnect-confirm'));
    return vi.waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });
});
