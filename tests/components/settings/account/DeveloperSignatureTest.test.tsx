vi.mock('@/hooks/session/useSession', async () => {
  const { sessionMock } = await import('@tests/support/mocks/session');
  return sessionMock({
    useSignerReady: () => true,
  });
});
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OBELISK_SIGNING_KINDS } from '@/constants/nostr/nostr-signing-kinds';
import DeveloperSignatureTest from '@/components/settings/account/DeveloperSignatureTest';
import { LocaleProvider } from '@tests/support/intl';

/** The component reads its copy from the dictionary, so it needs a provider. */
const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);


const signEventTemplate = vi.hoisted(() => vi.fn());

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    nostrActions: { signEventTemplate: (...args: unknown[]) => signEventTemplate(...args) },

  });
});

describe('DeveloperSignatureTest', () => {
  beforeEach(() => {
    signEventTemplate.mockReset().mockResolvedValue({ id: 'signed' });
  });

  it('requests every required signature without publishing anything', async () => {
    renderLocalized(<DeveloperSignatureTest />);
    fireEvent.click(screen.getByTestId('request-mock-signatures'));

    await waitFor(() => expect(signEventTemplate).toHaveBeenCalledTimes(OBELISK_SIGNING_KINDS.length));
    expect(signEventTemplate.mock.calls.map(([template]) => template.kind)).toEqual(OBELISK_SIGNING_KINDS);
    expect(signEventTemplate.mock.calls.find(([template]) => template.kind === 22242)?.[0]).toMatchObject({
      content: '',
      tags: expect.arrayContaining([
        ['relay', 'wss://public.obelisk.ar'],
        ['challenge', 'obelisk-developer-signature-test'],
      ]),
    });
    expect(await screen.findByRole('status')).toHaveTextContent(`${OBELISK_SIGNING_KINDS.length} accepted · 0 rejected`);
  });

  it('counts a refused signature as rejected and shows the message template for ordinary kinds', async () => {
    signEventTemplate.mockImplementation(async (template: { kind: number }) => {
      if (template.kind === OBELISK_SIGNING_KINDS[0]) throw new Error('refused');
      return { id: 'signed' };
    });
    renderLocalized(<DeveloperSignatureTest />);
    fireEvent.click(screen.getByTestId('request-mock-signatures'));
    expect(await screen.findByRole('status')).toHaveTextContent(`${OBELISK_SIGNING_KINDS.length - 1} accepted · 1 rejected`);
    const ordinary = signEventTemplate.mock.calls.find(([template]) => template.kind !== 22242)?.[0];
    expect(ordinary.tags[0]).toEqual(['client', 'Obelisk']);
    expect(ordinary.tags[1][0]).toBe('alt');
    expect(ordinary.content).not.toBe('');
  });

  it('on the phone, the relay-log row flips the developer preference', () => {
    renderLocalized(<DeveloperSignatureTest mobile />);
    const toggle = screen.getByTestId('mobile-developer-relay-debug-toggle');
    const before = toggle.getAttribute('aria-checked');
    fireEvent.click(toggle);
    expect(screen.getByTestId('mobile-developer-relay-debug-toggle').getAttribute('aria-checked')).not.toBe(before);
    fireEvent.click(screen.getByTestId('mobile-developer-relay-debug-toggle'));
    expect(screen.getByTestId('mobile-developer-relay-debug-toggle').getAttribute('aria-checked')).toBe(before);
  });
});
