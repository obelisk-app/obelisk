import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider, translator } from '@tests/support/intl';
import { ConfirmDialogHost } from '@/components/ui/overlays/ConfirmDialog';
import { useClearLocalData } from '@/hooks/shell/settings/useClearLocalData';
import { lowerAllWriteFences, type RemovalEnv } from '@/services/local-data';

const t = translator('en');
const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;

let env: RemovalEnv & { logout: ReturnType<typeof vi.fn<() => Promise<void>>>; reload: ReturnType<typeof vi.fn<() => void>>; relocate: ReturnType<typeof vi.fn<() => void>> };

beforeEach(() => {
  localStorage.clear();
  env = {
    logout: vi.fn<() => Promise<void>>(async () => undefined),
    reload: vi.fn<() => void>(),
    relocate: vi.fn<() => void>(),
    caches: { keys: async () => [], delete: async () => true, open: async () => ({ keys: async () => [] }) } as unknown as CacheStorage,
    serviceWorker: { getRegistrations: async () => [] } as unknown as ServiceWorkerContainer,
  };
  render(<LocaleProvider initialLocale="en"><ConfirmDialogHost /></LocaleProvider>);
});

afterEach(() => {
  lowerAllWriteFences();
  localStorage.clear();
});

describe('useClearLocalData', () => {
  it('measures every category', async () => {
    localStorage.setItem('obelisk:preferences', '{"a":1}');
    const { result } = renderHook(() => useClearLocalData(env), { wrapper });
    await waitFor(() => expect(result.current.usage).not.toBeNull());
    expect(result.current.usage?.preferences.present).toBe(true);
    expect(result.current.usage?.channels.present).toBe(false);
    expect(result.current.categories.map((c) => c.id)).toContain('login');
  });

  it('asks with the category sentence, and does nothing on cancel', async () => {
    localStorage.setItem('obelisk:preferences', '{}');
    const { result } = renderHook(() => useClearLocalData(env), { wrapper });
    let done: Promise<boolean> = Promise.resolve(false);
    act(() => { done = result.current.removeCategory('preferences'); });
    expect(await screen.findByText(t('help.localData.categories.preferences.title'))).toBeInTheDocument();
    expect(screen.getByText(t('settings.localData.confirm.preferences'))).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    await act(async () => { expect(await done).toBe(false); });
    expect(localStorage.getItem('obelisk:preferences')).toBe('{}');
    expect(env.reload).not.toHaveBeenCalled();
  });

  it('removes the category and reloads on confirm', async () => {
    localStorage.setItem('obelisk:preferences', '{}');
    localStorage.setItem('obelisk-dex/session', '{}');
    const { result } = renderHook(() => useClearLocalData(env), { wrapper });
    let done: Promise<boolean> = Promise.resolve(false);
    act(() => { done = result.current.removeCategory('preferences'); });
    fireEvent.click(await screen.findByTestId('confirm-dialog-confirm'));
    await act(async () => { expect(await done).toBe(true); });
    expect(localStorage.getItem('obelisk:preferences')).toBeNull();
    expect(localStorage.getItem('obelisk-dex/session')).toBe('{}');
    expect(env.reload).toHaveBeenCalledTimes(1);
  });

  it('warns that removing the login needs the key again, then logs out', async () => {
    localStorage.setItem('obelisk-dex/session', '{}');
    const { result } = renderHook(() => useClearLocalData(env), { wrapper });
    let done: Promise<boolean> = Promise.resolve(false);
    act(() => { done = result.current.removeCategory('login'); });
    expect(await screen.findByText(t('settings.localData.confirm.login'))).toBeInTheDocument();
    expect(t('settings.localData.confirm.login')).toMatch(/your key, your browser extension or your signer app/);
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await act(async () => { await done; });
    expect(env.logout).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('obelisk-dex/session')).toBeNull();
  });

  it('asks before removing everything, then logs out and clears it all', async () => {
    localStorage.setItem('obelisk:preferences', '{}');
    localStorage.setItem('obelisk-dex/session', '{}');
    const { result } = renderHook(() => useClearLocalData(env), { wrapper });
    let done: Promise<boolean> = Promise.resolve(false);
    act(() => { done = result.current.removeAll(); });
    expect(await screen.findByText(t('settings.localData.confirm.titleAll'))).toBeInTheDocument();
    expect(screen.getByText(t('settings.localData.confirm.all'))).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await act(async () => { expect(await done).toBe(true); });
    expect(localStorage.length).toBe(0);
    expect(env.logout).toHaveBeenCalledTimes(1);
    expect(env.relocate).toHaveBeenCalledTimes(1);
  });
});
