import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { buildImportGraph, staticClosure } from '@tests/support/import-graph';
import { initialNav } from '@/constants/shell/mobile';
import type { MobileScreenProps } from '@/hooks/shell/mobile/nav/usePhoneShell';

const loads = vi.hoisted(() => ({ desktop: 0, mobile: 0 }));
vi.mock('@/app/[locale]/app/user-panel/UserSettingsModal', () => {
  loads.desktop += 1;
  return { UserSettingsModal: () => <div data-testid="desktop-settings" /> };
});
vi.mock('@/hooks/shell/user-panel/useUserPanel', () => ({ useUserPanel: ({ initialEditing, onClose }: { initialEditing: boolean; onClose: () => void }) => ({ editing: initialEditing, finishEditing: onClose }) }));
vi.mock('@/app/[locale]/app/user-panel/UserProfileCard', () => ({ UserProfileCard: () => <div data-testid="profile-card" /> }));
vi.mock('@/app/[locale]/app/mobile/screens/settings/SettingsPrefsScreen', () => {
  loads.mobile += 1;
  return { SettingsPrefsScreen: () => <div data-testid="mobile-settings" /> };
});
vi.mock('@/app/[locale]/app/mobile/screens/server/ServerScreen', () => ({ ServerScreen: () => <div data-testid="server" /> }));

import UserPanel from '@/app/[locale]/app/user-panel/UserPanel';
import { MobileScreenBody } from '@/app/[locale]/app/mobile/carousel/MobileScreenBody';

describe('settings load on demand', () => {
  it('does not fetch desktop settings for the profile card', async () => {
    const onClose = vi.fn();
    const host = (editing: boolean) => <LocaleProvider initialLocale="en"><UserPanel pubkey="person" isMe initialEditing={editing} onClose={onClose} /></LocaleProvider>;
    const view = render(host(false));
    expect(loads.desktop).toBe(0);
    view.rerender(host(true));
    expect(screen.getByTestId('desktop-settings-loading')).toHaveClass('fixed', 'inset-0');
    expect(screen.getByRole('dialog', { name: 'User settings' })).toHaveAttribute('aria-modal', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(await screen.findByTestId('desktop-settings')).toBeInTheDocument();
    expect(loads.desktop).toBe(1);
  });
  it('does not fetch phone preferences for other screens', async () => {
    const p = {} as MobileScreenProps;
    const view = render(<MobileScreenBody nav={{ ...initialNav, screen: 'server' }} p={p} />);
    expect(loads.mobile).toBe(0);
    view.rerender(<MobileScreenBody nav={{ ...initialNav, screen: 'settings-prefs' }} p={p} />);
    expect(screen.getByTestId('mobile-settings-loading')).toBeInTheDocument();
    expect(await screen.findByTestId('mobile-settings')).toBeInTheDocument();
    expect(loads.mobile).toBe(1);
  });
  it('keeps both settings trees outside the static shell graph', () => {
    const graph = buildImportGraph();
    for (const shell of ['desktop/DesktopShell', 'mobile/PhoneShell']) {
      const imports = staticClosure(graph, `src/app/[locale]/app/${shell}.tsx`);
      expect(imports.has('src/app/[locale]/app/user-panel/UserSettingsModal.tsx')).toBe(false);
      expect(imports.has('src/app/[locale]/app/mobile/screens/settings/SettingsPrefsScreen.tsx')).toBe(false);
    }
  });
});
