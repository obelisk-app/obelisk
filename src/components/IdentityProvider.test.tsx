import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IdentityProvider } from './IdentityProvider';
import { useAuthStore } from '@/store/auth';

const restoreSessionMock = vi.fn();
const restoreRemoteSignerMock = vi.fn();
const connectNDKMock = vi.fn(() => Promise.resolve({}));

vi.mock('@/lib/nostr', async () => {
  const actual = await vi.importActual<typeof import('@/lib/nostr')>('@/lib/nostr');
  return {
    ...actual,
    connectNDK: () => connectNDKMock(),
    restoreRemoteSigner: () => restoreRemoteSignerMock(),
    getNDK: () => ({
      get signer() { return signerRef.current; },
      pool: { relays: new Map() },
    }),
  };
});

const signerRef: { current: unknown } = { current: null };

beforeEach(() => {
  restoreSessionMock.mockReset();
  restoreRemoteSignerMock.mockReset();
  connectNDKMock.mockClear();
  signerRef.current = null;
  useAuthStore.setState({
    isConnected: false,
    signerReady: false,
    profile: null,
    loginMethod: null,
    user: null,
  });
  // Override restoreSession on the auth store with our spy.
  useAuthStore.setState({
    restoreSession: async () => {
      restoreSessionMock();
      return restoreSessionMock.mock.results[0]?.value ?? false;
    },
  } as Partial<ReturnType<typeof useAuthStore.getState>> as never);
});

describe('IdentityProvider', () => {
  it('renders children immediately (does not block on session check)', () => {
    restoreSessionMock.mockReturnValue(false);
    render(
      <IdentityProvider requireSession={false}>
        <div data-testid="child">hi</div>
      </IdentityProvider>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('calls restoreSession on mount, exactly once even if it re-renders', async () => {
    restoreSessionMock.mockReturnValue(false);
    const { rerender } = render(
      <IdentityProvider requireSession={false}>
        <div />
      </IdentityProvider>,
    );
    rerender(
      <IdentityProvider requireSession={false}>
        <div />
      </IdentityProvider>,
    );
    await waitFor(() => expect(restoreSessionMock).toHaveBeenCalledTimes(1));
  });

  it('calls onSessionInvalid when session check fails and requireSession is true', async () => {
    restoreSessionMock.mockReturnValue(false);
    const onInvalid = vi.fn();
    render(
      <IdentityProvider requireSession onSessionInvalid={onInvalid}>
        <div />
      </IdentityProvider>,
    );
    await waitFor(() => expect(onInvalid).toHaveBeenCalled());
  });

  it('does not call onSessionInvalid when requireSession is false', async () => {
    restoreSessionMock.mockReturnValue(false);
    const onInvalid = vi.fn();
    render(
      <IdentityProvider requireSession={false} onSessionInvalid={onInvalid}>
        <div />
      </IdentityProvider>,
    );
    await waitFor(() => expect(restoreSessionMock).toHaveBeenCalled());
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it('flips signerReady to true after a successful nsec signer restore', async () => {
    restoreSessionMock.mockReturnValue(true);
    restoreRemoteSignerMock.mockImplementation(async () => {
      // Simulate `restoreRemoteSigner` setting the NDK signer.
      signerRef.current = { pubkey: 'a'.repeat(64) };
      return true;
    });

    // Seed profile so the signer-restore effect's `profilePubkey` guard
    // permits proceeding.
    act(() => {
      useAuthStore.setState({
        profile: { pubkey: 'a'.repeat(64), npub: '' } as never,
        loginMethod: 'nsec',
      });
    });

    render(
      <IdentityProvider>
        <div />
      </IdentityProvider>,
    );

    await waitFor(() => expect(restoreRemoteSignerMock).toHaveBeenCalled());
    await waitFor(() => expect(useAuthStore.getState().signerReady).toBe(true));
  });
});
