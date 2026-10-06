/**
 * The login modal around the (mocked) SDK widget: a pasted nsec waits
 * behind the notice, every other method goes straight to the bridge, the
 * SDK runs on memory-only storage with its own restore off, and a session
 * the vault could not restore is explained above the methods.
 */
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nip19 } from 'nostr-tools';
import type { ReactNode } from 'react';
import LoginModal from '@/app/app/LoginModal';
import type { SessionNotice } from '@/services/nostr-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';

const actions = vi.hoisted(() => ({ loginWithNsec: vi.fn(), loginWithNip07: vi.fn(), loginWithBunker: vi.fn() }));
const notice = vi.hoisted(() => ({ current: null as SessionNotice | null }));
let sdkProps: Record<string, unknown> = {};
let providerProps: Record<string, unknown> = {};

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/app/app/GeneratedProfileEnhancements', () => ({ randomProfileName: () => 'Brave Badger', default: () => null }));
vi.mock('@nostr-wot/data', async (orig) => ({
  ...await orig<typeof import('@nostr-wot/data')>(),
  getPool: () => ({ publish: () => [Promise.resolve('ok')] }),
}));
vi.mock('@nostr-wot/ui', async () => {
  const React = await import('react');
  return {
    LoginModal: (props: Record<string, unknown>) => {
      sdkProps = props;
      const slots = props.slots as { beforeMethods?: ReactNode } | undefined;
      return React.createElement('div', { 'data-testid': 'sdk-login' }, slots?.beforeMethods);
    },
    Modal: ({ children }: { children: ReactNode }) => React.createElement('div', null, children),
    NostrSessionProvider: (props: Record<string, unknown> & { children: ReactNode }) => {
      providerProps = props;
      return props.children;
    },
    SIGNER_STORAGE_KEY_NSEC: '@nostr-wot/ui:nsec',
  };
});

const NSEC = nip19.nsecEncode(new Uint8Array(32).fill(7));
const sdkLogin = (args: Record<string, unknown>) =>
  act(async () => { await (sdkProps.onLogin as (a: unknown) => Promise<void>)({ pubkey: '1'.repeat(64), ...args }); });

beforeEach(() => {
  sdkProps = {};
  providerProps = {};
  notice.current = null;
  localStorage.clear();
  for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue(undefined);
  renderModal();
});

describe('LoginModal: a pasted key', () => {
  it('shows the notice and does not hand the key to the bridge until Continue', async () => {
    await sdkLogin({ method: 'import', nsec: NSEC });

    const step = screen.getByTestId('pasted-key-notice');
    expect(step).toHaveTextContent(/least safe/);
    expect(step).toHaveTextContent(/extension/);
    expect(step).toHaveTextContent(/bunker/);
    expect(actions.loginWithNsec).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Continue with this key' }));
    await waitFor(() => expect(actions.loginWithNsec).toHaveBeenCalledWith('07'.repeat(32), expect.stringMatching(/^[0-9a-f]{64}$/)));
  });

  it('goes back to the methods without logging in', async () => {
    await sdkLogin({ method: 'import', nsec: NSEC });
    fireEvent.click(screen.getByRole('button', { name: 'Use an extension or bunker' }));

    expect(screen.getByTestId('sdk-login')).toBeInTheDocument();
    expect(actions.loginWithNsec).not.toHaveBeenCalled();
  });

  it('shows the bridge error on the notice and lets the person try again', async () => {
    actions.loginWithNsec.mockRejectedValueOnce(new Error('relay unreachable'));
    await sdkLogin({ method: 'import', nsec: NSEC });
    fireEvent.click(screen.getByRole('button', { name: 'Continue with this key' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('relay unreachable');
    expect(screen.getByRole('button', { name: 'Continue with this key' })).toBeEnabled();
  });

  it('never shows the notice for the extension, a bunker or a generated key', async () => {
    await sdkLogin({ method: 'nip07' });
    await sdkLogin({ method: 'nip46', bunkerUri: 'bunker://x?relay=wss://r', signer: {} });
    expect(screen.queryByTestId('pasted-key-notice')).toBeNull();
    expect(actions.loginWithNip07).toHaveBeenCalledOnce();
    expect(actions.loginWithBunker).toHaveBeenCalledOnce();

    await sdkLogin({ method: 'generate', nsec: NSEC });
    expect(screen.queryByTestId('pasted-key-notice')).toBeNull();
    expect(screen.getByTestId('generated-npub-step')).toBeInTheDocument();
  });
});

describe('LoginModal: the SDK storage', () => {
  it('runs the widget with its own restore off and storage that never touches localStorage', () => {
    expect(providerProps.autoRestore).toBe(false);
    const storage = providerProps.signerStorage as { setItem(k: string, v: string): void; getItem(k: string): string | null };
    const before = localStorage.length;
    storage.setItem('@nostr-wot/ui:nip46', '{"clientNsec":"nsec1pairing"}');
    storage.setItem('@nostr-wot/ui:nsec', NSEC);

    expect(localStorage.length).toBe(before);
    expect(localStorage.getItem('@nostr-wot/ui:nip46')).toBeNull();
    expect(storage.getItem('@nostr-wot/ui:nip46')).toContain('nsec1pairing');
    expect(storage.getItem('@nostr-wot/ui:nsec')).toBeNull();
    expect(sdkProps.showRememberToggle).toBe(false);
  });
});

describe('LoginModal: a session that could not be restored', () => {
  it.each([
    ['vault-unavailable', /can't keep your key safely between visits/],
    ['key-missing', /couldn't unlock your saved key/],
    ['unlock-failed', /couldn't unlock your saved key/],
  ] as const)('explains %s above the methods', (code, text) => {
    notice.current = code;
    cleanupAndRender();
    expect(screen.getByTestId('session-notice')).toHaveTextContent(text);
  });

  it('shows nothing for no notice or for a visit-only login', () => {
    expect(screen.queryByTestId('session-notice')).toBeNull();
    notice.current = 'not-remembered';
    cleanupAndRender();
    expect(screen.queryByTestId('session-notice')).toBeNull();
  });
});

/** The modal on a logged-out fake bridge whose login commands are the spies above. */
function renderModal() {
  const bridge = fakeBridge({ isLoggedIn: false, myPubkey: null, sessionNotice: notice.current }, actions);
  renderWithBridge(<LoginModal />, bridge);
}

function cleanupAndRender() {
  cleanup();
  renderModal();
}
