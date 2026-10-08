/**
 * Against the REAL @nostr-wot/ui login widget: nothing it does in Obelisk
 * lands in localStorage, the "Remember on this device" box is the one thing
 * the hiding rule in globals.css matches, and a pasted nsec waits behind the
 * notice before the bridge sees it.
 *
 * The widget's own default storage is plaintext localStorage; Obelisk hands
 * it memory-only storage (`src/services/session/signer-storage.ts`). Every
 * assertion below is a scan of the real storage after the real widget ran.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import LoginModal from '@/app/[locale]/app/login/LoginModal';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';

const push = vi.hoisted(() => vi.fn());
const loginWithNsec = vi.hoisted(() => vi.fn());

vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock({ useRouter: () => ({ push }) }));
// The QR pairing never completes: the widget mints and stores its client key, then waits.
vi.mock('nostr-tools/nip46', async (orig) => ({
  ...(await orig<typeof import('nostr-tools/nip46')>()),
  BunkerSigner: { fromURI: () => new Promise(() => {}), fromBunker: vi.fn() },
}));

/** The hiding rule, read from the stylesheet the app ships. */
const REMEMBER_SELECTOR = (() => {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
  const match = css.match(/^(\.obelisk-login-modal label[^{]*)\{\s*display:\s*none !important;\s*\}/m);
  if (!match) throw new Error('remember-toggle hiding rule not found in globals.css');
  return match[1].trim();
})();

function everyStoredString(): string {
  const parts: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    parts.push(key, localStorage.getItem(key) ?? '');
  }
  return parts.join('\n');
}

const renderModal = (methods: Array<'import' | 'generate' | 'nip46'>) => renderWithBridge(
  <LoginModal methods={methods} />,
  fakeBridge(
    { isLoggedIn: false, myPubkey: null },
    { loginWithNsec: (...a: [string, string]) => loginWithNsec(...a), loginWithNip07: vi.fn(), loginWithBunker: vi.fn() },
  ),
);

beforeEach(() => {
  localStorage.clear();
  loginWithNsec.mockReset().mockResolvedValue(undefined);
});

describe('the SDK login widget in Obelisk (real SDK)', () => {
  it('a pasted nsec with "Remember" ticked is not stored, and waits behind the notice', async () => {
    const sk = generateSecretKey();
    const nsec = nip19.nsecEncode(sk);
    renderModal(['import']);
    fireEvent.click(await screen.findByText('Paste private key'));
    fireEvent.change(await screen.findByPlaceholderText(/nsec1/), { target: { value: nsec } });
    const remember = screen.getByRole('checkbox', { name: /remember on this device/i });
    fireEvent.click(remember);
    expect(remember.closest('label')!.matches(REMEMBER_SELECTOR)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /^(log in|sign in|continue|import)/i }));

    expect(await screen.findByTestId('pasted-key-notice')).toHaveTextContent(/least safe/);
    expect(screen.getByTestId('pasted-key-notice')).toHaveTextContent(/extension/);
    expect(screen.getByTestId('pasted-key-notice')).toHaveTextContent(/bunker/);
    expect(loginWithNsec).not.toHaveBeenCalled();
    expect(localStorage.getItem('@nostr-wot/ui:nsec')).toBeNull();
    expect(everyStoredString()).not.toContain(nsec);

    fireEvent.click(screen.getByRole('button', { name: 'Continue with this key' }));
    await waitFor(() => expect(loginWithNsec).toHaveBeenCalledTimes(1));
    const [skHex, pkHex] = loginWithNsec.mock.calls[0] as [string, string];
    expect(pkHex).toBe(getPublicKey(sk));
    expect(skHex).toMatch(/^[0-9a-f]{64}$/);
    expect(everyStoredString()).not.toContain(nsec);
  });

  it('"Use an extension or bunker" drops the pasted key and returns to the methods', async () => {
    renderModal(['import', 'nip46']);
    fireEvent.click(await screen.findByText('Paste private key'));
    fireEvent.change(await screen.findByPlaceholderText(/nsec1/), { target: { value: nip19.nsecEncode(generateSecretKey()) } });
    fireEvent.click(screen.getByRole('button', { name: /^(log in|sign in|continue|import)/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use an extension or bunker' }));

    expect(await screen.findByText('Paste private key')).toBeInTheDocument();
    expect(screen.queryByTestId('pasted-key-notice')).toBeNull();
    expect(loginWithNsec).not.toHaveBeenCalled();
  });

  it('the hiding rule matches the Remember box and not the backup acknowledgement; a ticked box stores nothing', async () => {
    renderModal(['generate']);
    fireEvent.click(await screen.findByText(/create a new/i));
    const ack = await screen.findByRole('checkbox', { name: /backed up my nsec/i });
    const remember = screen.getByRole('checkbox', { name: /remember on this device/i });

    const hidden = Array.from(document.querySelectorAll(REMEMBER_SELECTOR));
    expect(hidden).toEqual([remember.closest('label')]);
    expect(ack.closest('label')!.matches(REMEMBER_SELECTOR)).toBe(false);

    fireEvent.click(ack);
    fireEvent.click(remember);
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await screen.findByPlaceholderText('Builder, chef, occasional cyclist.');
    expect(localStorage.getItem('@nostr-wot/ui:nsec')).toBeNull();
    expect(everyStoredString()).not.toMatch(/nsec1/);
  });

  it('a NIP-46 QR pairing keeps its client key out of localStorage', async () => {
    renderModal(['nip46']);
    const nip46 = await screen.findByText(/NIP-46/);
    fireEvent.click(nip46);
    await waitFor(() => expect(document.querySelector('.nui-qr svg, .nui-qr-wrap')).not.toBeNull(), { timeout: 3000 });

    expect(localStorage.getItem('@nostr-wot/ui:nip46')).toBeNull();
    expect(everyStoredString()).not.toMatch(/nsec1/);
  });
});
